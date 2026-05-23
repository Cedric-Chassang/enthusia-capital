"""
Refreshes data/companies.json with constituents and profile data for
S&P 500, NASDAQ 100, and Russell 2000.

Sources:
- S&P 500 / NASDAQ 100 constituents: Wikipedia (HTML tables)
- Russell 2000 constituents: iShares IWM ETF holdings CSV
- Profile (sector, industry, logo, website): Finnhub /stock/profile2
- Business description: Wikipedia REST API summary endpoint

Usage:
    cd <project root>
    python scripts/refresh-data.py

Requires: requests, pandas, lxml, python-dotenv  (see scripts/requirements.txt)

Output: data/companies.json
Log:    scripts/refresh-data.log
"""

from __future__ import annotations
import io
import json
import os
import re
import sys
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import pandas as pd
import requests
from dotenv import load_dotenv

# ─── Paths ───────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SCRIPT_DIR = ROOT / "scripts"
OUT_FILE = DATA_DIR / "companies.json"
PROGRESS_FILE = SCRIPT_DIR / "refresh-progress.json"
LOG_FILE = SCRIPT_DIR / "refresh-data.log"

# ─── Config ──────────────────────────────────────────────────────────────────
load_dotenv(ROOT / ".env")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY")
if not FINNHUB_KEY:
    sys.exit("ERROR: FINNHUB_API_KEY not set in .env")

FINNHUB_BASE = "https://finnhub.io/api/v1"
WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary"
WIKI_API = "https://en.wikipedia.org/w/api.php"

# Finnhub free tier: 60 calls/min. Use 55 to leave headroom for retries.
FINNHUB_CALLS_PER_MIN = 55
FINNHUB_INTERVAL = 60.0 / FINNHUB_CALLS_PER_MIN  # seconds between calls
WIKI_WORKERS = 8                                 # Wikipedia is rate-tolerant
SAVE_EVERY = 25                                  # checkpoint after N companies

REQUEST_TIMEOUT = 15
USER_AGENT = "EnthusiaCapital-Research/1.0 (research data refresh)"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("refresh")

# ─── Data models ─────────────────────────────────────────────────────────────
@dataclass
class Company:
    ticker: str
    name: str = ""
    sector: str = ""
    industry: str = ""
    description: str = ""
    website: str = ""
    domain: str = ""
    logo: str = ""
    marketCap: float = 0.0           # in millions of USD (Finnhub's `marketCapitalization`)
    sharesOutstanding: float = 0.0   # in millions (Finnhub's `shareOutstanding`)
    peRatio: float = 0.0             # trailing twelve months
    weekHigh52: float = 0.0          # 52-week high price ($)
    weekLow52: float = 0.0           # 52-week low price ($)
    indices: list[str] = field(default_factory=list)

    def is_complete(self) -> bool:
        # Minimum bar: at least a name + sector OR a description
        return bool(self.name) and (bool(self.sector) or bool(self.description))


# ─── Constituent fetchers ────────────────────────────────────────────────────
def get_sp500() -> set[str]:
    log.info("Fetching S&P 500 constituents from Wikipedia…")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": USER_AGENT}
    html = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT).text
    tables = pd.read_html(io.StringIO(html))
    tickers = set(tables[0]["Symbol"].astype(str).str.strip())
    log.info(f"  → {len(tickers)} S&P 500 tickers")
    return tickers


def get_nasdaq100() -> set[str]:
    log.info("Fetching NASDAQ 100 constituents from Wikipedia…")
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    headers = {"User-Agent": USER_AGENT}
    html = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT).text
    tables = pd.read_html(io.StringIO(html))
    # Find the constituents table — first table that has a "Ticker" or "Symbol"
    # column AND looks like an equity list (~100 rows, short ticker strings).
    for t in tables:
        try:
            cols_map = {str(c).lower(): c for c in t.columns}
        except Exception:
            continue
        for key in ("ticker", "symbol"):
            if key not in cols_map:
                continue
            col = cols_map[key]
            try:
                raw = t[col].astype(str).str.strip()
            except Exception:
                continue
            tickers = {x for x in raw if re.match(r"^[A-Z][A-Z0-9.\-]{0,5}$", x)}
            # NASDAQ 100 should have ~100 tickers. Skip tables with too few.
            if 50 <= len(tickers) <= 110:
                log.info(f"  → {len(tickers)} NASDAQ 100 tickers")
                return tickers
    raise RuntimeError("Could not locate NASDAQ 100 constituents table on Wikipedia")


def _build_browser_session(landing_url: str) -> requests.Session:
    """Build a Session with browser-like headers and warm cookies from landing."""
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    })
    try:
        sess.get(landing_url, timeout=REQUEST_TIMEOUT)
    except Exception:
        pass
    return sess


def _try_ishares(sess: requests.Session, url: str, referer: str) -> Optional[str]:
    """Return CSV body if the iShares URL returns real CSV; None otherwise."""
    headers = {
        "Accept": "text/csv,text/plain,application/csv,*/*",
        "Referer": referer,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
    }
    try:
        r = sess.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        if r.status_code != 200:
            return None
        body = r.text
        # If it returned HTML, iShares blocked us
        if body.lstrip().lower().startswith(("<!doctype", "<html")):
            return None
        return body
    except Exception:
        return None


def get_russell2000() -> set[str]:
    """Russell 2000 constituents.

    Resolution order:
      1. Local file at data/IWM_holdings.csv  (manual fallback — see README)
      2. iShares IWM holdings CSV (multiple URLs, warm session — usually blocked by Akamai)
      3. Wikipedia Russell 2000 list (incomplete)
    """
    log.info("Fetching Russell 2000 constituents…")

    # 1. Local file fallback — preferred path when iShares blocks
    local = DATA_DIR / "IWM_holdings.csv"
    if local.exists():
        log.info(f"  using local file {local.name} (manual download)")
        with open(local, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        tickers = _parse_ishares_csv(text)
        if tickers:
            log.info(f"  → {len(tickers)} Russell 2000 tickers (local file)")
            return tickers
        log.warning("  local IWM_holdings.csv exists but could not be parsed")

    # 2. Try iShares directly
    landing = "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf"
    sess = _build_browser_session(landing)

    candidates = [
        landing + "/1467271812596.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund",
        landing + "/1521942788811.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund",
        "https://www.ishares.com/us/literature/holdings/iwm-holdings.csv",
    ]
    text = None
    for url in candidates:
        log.info(f"  trying {url[:90]}…")
        text = _try_ishares(sess, url, landing)
        if text:
            log.info("  iShares returned CSV ✓")
            break
    if not text:
        log.warning(
            "  iShares blocked (Akamai). Download the CSV manually from\n"
            f"    {landing}\n"
            "  (click 'Detailed Holdings and Analytics' → Download), and save it as\n"
            f"    {local}\n"
            "  Then re-run this script."
        )
        return _get_russell2000_wikipedia()

    tickers = _parse_ishares_csv(text)
    if not tickers:
        log.warning("  Could not parse iShares CSV body — falling back to Wikipedia")
        return _get_russell2000_wikipedia()
    log.info(f"  → {len(tickers)} Russell 2000 tickers (from iShares)")
    return tickers


def _parse_ishares_csv(text: str) -> set[str]:
    """Extract equity tickers from an iShares ETF holdings CSV body."""
    lines = text.splitlines()
    header_idx = next(
        (i for i, ln in enumerate(lines) if ln.lower().startswith("ticker,")),
        None,
    )
    if header_idx is None:
        return set()

    csv_body = "\n".join(lines[header_idx:])
    try:
        df = pd.read_csv(io.StringIO(csv_body))
    except Exception:
        return set()
    if "Ticker" not in df.columns:
        return set()

    # Filter to equity holdings only (drop cash, futures, etc.)
    if "Asset Class" in df.columns:
        df = df[df["Asset Class"].str.contains("Equity", case=False, na=False)]

    tickers = set(df["Ticker"].dropna().astype(str).str.strip())
    return {x for x in tickers if re.match(r"^[A-Z][A-Z0-9.\-]{0,5}$", x)}


def _get_russell2000_wikipedia() -> set[str]:
    """Fallback: Wikipedia has an incomplete but reasonable Russell 2000 list."""
    url = "https://en.wikipedia.org/wiki/Russell_2000_Index"
    try:
        html = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT).text
        tables = pd.read_html(io.StringIO(html))
        for t in tables:
            cols_map = {str(c).lower(): c for c in t.columns}
            if "ticker" in cols_map or "symbol" in cols_map:
                col = cols_map.get("ticker") or cols_map.get("symbol")
                raw = t[col].astype(str).str.strip()
                tickers = {x for x in raw if re.match(r"^[A-Z][A-Z0-9.\-]{0,5}$", x)}
                if len(tickers) > 100:
                    log.info(f"  → {len(tickers)} Russell 2000 tickers (Wikipedia fallback)")
                    return tickers
    except Exception as e:
        log.error(f"  Wikipedia fallback also failed: {e}")
    log.error("  Could not fetch Russell 2000 from any source — returning empty set")
    return set()


# ─── Finnhub ─────────────────────────────────────────────────────────────────
class FinnhubClient:
    def __init__(self, key: str):
        self.key = key
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.last_call = 0.0

    def _throttle(self):
        elapsed = time.time() - self.last_call
        if elapsed < FINNHUB_INTERVAL:
            time.sleep(FINNHUB_INTERVAL - elapsed)
        self.last_call = time.time()

    def profile2(self, ticker: str) -> Optional[dict]:
        self._throttle()
        try:
            r = self.session.get(
                f"{FINNHUB_BASE}/stock/profile2",
                params={"symbol": ticker, "token": self.key},
                timeout=REQUEST_TIMEOUT,
            )
            if r.status_code == 429:
                log.warning(f"  {ticker}: 429 rate limit, sleeping 65s")
                time.sleep(65)
                return self.profile2(ticker)
            r.raise_for_status()
            data = r.json()
            return data if data else None
        except Exception as e:
            log.warning(f"  {ticker}: Finnhub error: {e}")
            return None

    def basic_financials(self, ticker: str) -> Optional[dict]:
        """Returns the `metric` block (P/E, 52w range, etc.) or None."""
        self._throttle()
        try:
            r = self.session.get(
                f"{FINNHUB_BASE}/stock/metric",
                params={"symbol": ticker, "metric": "all", "token": self.key},
                timeout=REQUEST_TIMEOUT,
            )
            if r.status_code == 429:
                log.warning(f"  {ticker}: 429 rate limit (metric), sleeping 65s")
                time.sleep(65)
                return self.basic_financials(ticker)
            r.raise_for_status()
            data = r.json()
            return (data or {}).get("metric") or None
        except Exception as e:
            log.warning(f"  {ticker}: Finnhub metric error: {e}")
            return None


# ─── Wikipedia descriptions ──────────────────────────────────────────────────
def wiki_summary(title: str) -> Optional[str]:
    """Fetch the lead paragraph summary for a Wikipedia article."""
    try:
        r = requests.get(
            f"{WIKI_REST}/{quote(title, safe='')}",
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("type") == "disambiguation":
            return None
        extract = data.get("extract", "").strip()
        if len(extract) < 50:
            return None
        return extract
    except Exception:
        return None


def wiki_search(query: str) -> Optional[str]:
    """Use Wikipedia opensearch to find the best matching page title."""
    try:
        r = requests.get(
            WIKI_API,
            params={
                "action": "opensearch",
                "format": "json",
                "search": query,
                "limit": 1,
                "namespace": 0,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code != 200:
            return None
        results = r.json()
        if len(results) >= 2 and results[1]:
            return results[1][0]
        return None
    except Exception:
        return None


def get_description(name: str, ticker: str) -> str:
    """Try several strategies to find a clean Wikipedia summary."""
    if not name:
        return ""

    # Strip suffixes Finnhub adds (Inc, Corp, etc.) for cleaner search
    base = re.sub(r"\b(Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|PLC|N\.V\.|S\.A\.|Holdings|Group)\.?$", "", name).strip().rstrip(",")

    # Strategy 1: "<name> (company)" — disambiguates many cases
    for variant in (f"{base} (company)", base, name):
        result = wiki_summary(variant.replace(" ", "_"))
        if result:
            return result

    # Strategy 2: opensearch
    title = wiki_search(f"{base} company")
    if title:
        result = wiki_summary(title.replace(" ", "_"))
        if result:
            return result

    return ""


# ─── Domain extraction ───────────────────────────────────────────────────────
def extract_domain(url: str) -> str:
    if not url:
        return ""
    m = re.match(r"^(?:https?://)?(?:www\.)?([^/]+)", url.strip())
    return m.group(1).lower() if m else ""


# ─── Checkpoint / resume ─────────────────────────────────────────────────────
def load_progress() -> dict[str, Company]:
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            raw = json.load(f)
        return {t: Company(**c) for t, c in raw.items()}
    return {}


def save_progress(companies: dict[str, Company]):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump({t: c.__dict__ for t, c in companies.items()}, f, ensure_ascii=False, indent=1)


# ─── Main build ──────────────────────────────────────────────────────────────
def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Constituents
    try:
        sp500 = get_sp500()
    except Exception as e:
        log.error(f"S&P 500 fetch failed: {e}")
        sp500 = set()
    try:
        ndx = get_nasdaq100()
    except Exception as e:
        log.error(f"NASDAQ 100 fetch failed: {e}")
        ndx = set()
    try:
        rut = get_russell2000()
    except Exception as e:
        log.error(f"Russell 2000 fetch failed: {e}")
        rut = set()

    universe = sorted(sp500 | ndx | rut)
    log.info(f"Total unique tickers across all three indices: {len(universe)}")

    # 2. Resume support
    companies = load_progress()
    log.info(f"Resuming with {len(companies)} previously cached profiles")

    # 3. Finnhub profiles (sequential, rate-limited)
    # Fetch for any ticker missing a name OR any of the cap/shares fields
    # (the latter so legacy snapshots get back-filled without a full purge).
    fh = FinnhubClient(FINNHUB_KEY)
    to_fetch = [
        t for t in universe
        if t not in companies
        or not companies[t].name
        or not companies[t].marketCap
        or not companies[t].sharesOutstanding
    ]
    log.info(f"Need Finnhub profiles for {len(to_fetch)} tickers")

    for i, ticker in enumerate(to_fetch, 1):
        prof = fh.profile2(ticker)
        c = companies.get(ticker, Company(ticker=ticker))
        if prof:
            c.name = prof.get("name", "") or c.name
            c.industry = prof.get("finnhubIndustry", "") or c.industry
            c.website = prof.get("weburl", "") or c.website
            c.domain = extract_domain(c.website)
            c.logo = prof.get("logo", "") or c.logo
            mc = prof.get("marketCapitalization")
            if mc:
                c.marketCap = float(mc)
            so = prof.get("shareOutstanding")
            if so:
                c.sharesOutstanding = float(so)
        companies[ticker] = c
        if i % SAVE_EVERY == 0:
            save_progress(companies)
            log.info(f"  Finnhub progress: {i}/{len(to_fetch)} (saved checkpoint)")

    save_progress(companies)
    log.info("Finnhub stage complete.")

    # 3b. Finnhub basic financials — P/E (TTM) and 52-week range.
    # Back-fills any ticker missing these fields. Same rate budget as profile2.
    to_fetch_fin = [
        t for t in universe
        if t in companies
        and (not companies[t].peRatio or not companies[t].weekHigh52 or not companies[t].weekLow52)
    ]
    log.info(f"Need Finnhub basic financials for {len(to_fetch_fin)} tickers")

    for i, ticker in enumerate(to_fetch_fin, 1):
        metric = fh.basic_financials(ticker)
        if metric:
            c = companies[ticker]
            # Prefer TTM, fall back to annualised. Skip non-positive (loss-making).
            pe = metric.get("peTTM") or metric.get("peNormalizedAnnual") or metric.get("peBasicExclExtraTTM")
            if pe and pe > 0:
                c.peRatio = float(pe)
            wh = metric.get("52WeekHigh")
            wl = metric.get("52WeekLow")
            if wh and wh > 0:
                c.weekHigh52 = float(wh)
            if wl and wl > 0:
                c.weekLow52 = float(wl)
        if i % SAVE_EVERY == 0:
            save_progress(companies)
            log.info(f"  Basic financials progress: {i}/{len(to_fetch_fin)} (saved checkpoint)")

    save_progress(companies)
    log.info("Basic financials stage complete.")

    # 4. Wikipedia descriptions (concurrent)
    need_desc = [t for t in universe if t in companies and not companies[t].description]
    log.info(f"Fetching Wikipedia descriptions for {len(need_desc)} tickers (concurrent)…")

    def task(ticker):
        c = companies[ticker]
        desc = get_description(c.name, ticker)
        return ticker, desc

    with ThreadPoolExecutor(max_workers=WIKI_WORKERS) as ex:
        futures = {ex.submit(task, t): t for t in need_desc}
        done = 0
        for fut in as_completed(futures):
            try:
                ticker, desc = fut.result()
                if desc:
                    companies[ticker].description = desc
            except Exception as e:
                log.warning(f"  Wiki future failed: {e}")
            done += 1
            if done % 100 == 0:
                save_progress(companies)
                log.info(f"  Wikipedia progress: {done}/{len(need_desc)}")

    save_progress(companies)
    log.info("Wikipedia stage complete.")

    # 5. Map Finnhub's fine-grained industries to the 11 GICS sectors used
    #    for nav grouping. Always recompute (sector is purely derived), so
    #    that adjustments to INDUSTRY_TO_SECTOR are picked up on every run.
    unmapped_industries = {}
    for c in companies.values():
        if c.industry:
            c.sector = map_industry_to_sector(c.industry)
            if c.sector == "Other":
                unmapped_industries[c.industry] = unmapped_industries.get(c.industry, 0) + 1
        else:
            c.sector = ""

    if unmapped_industries:
        log.info(f"Unmapped industries → bucketed as 'Other' ({len(unmapped_industries)} distinct):")
        for ind, n in sorted(unmapped_industries.items(), key=lambda x: -x[1]):
            log.info(f"  {n:4d}  {ind}")

    # 6. Tag indices on each company
    for ticker, c in companies.items():
        idx = []
        if ticker in sp500: idx.append("sp500")
        if ticker in ndx:   idx.append("nasdaq100")
        if ticker in rut:   idx.append("russell2000")
        c.indices = idx

    # 7. Emit final JSON
    out = {
        "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
        "indices": {
            "sp500":       {"name": "S&P 500",      "tickers": sorted([t for t in sp500 if t in companies])},
            "nasdaq100":   {"name": "NASDAQ 100",   "tickers": sorted([t for t in ndx if t in companies])},
            "russell2000": {"name": "Russell 2000", "tickers": sorted([t for t in rut if t in companies])},
        },
        "companies": {
            t: {
                "name":              c.name,
                "sector":            c.sector,
                "industry":          c.industry,
                "description":       c.description,
                "website":           c.website,
                "domain":            c.domain,
                "logo":              c.logo,
                "marketCap":         c.marketCap,
                "sharesOutstanding": c.sharesOutstanding,
                "peRatio":           c.peRatio,
                "weekHigh52":        c.weekHigh52,
                "weekLow52":         c.weekLow52,
                "indices":           c.indices,
            }
            for t, c in sorted(companies.items())
            if c.is_complete()
        },
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    n_total = len(out["companies"])
    log.info(f"Wrote {OUT_FILE} with {n_total} companies.")
    log.info(f"  S&P 500:      {len(out['indices']['sp500']['tickers'])}")
    log.info(f"  NASDAQ 100:   {len(out['indices']['nasdaq100']['tickers'])}")
    log.info(f"  Russell 2000: {len(out['indices']['russell2000']['tickers'])}")
    log.info("Done.")


# ─── Finnhub industry → GICS sector mapping ──────────────────────────────────
# Finnhub returns finer-grained "industries" (e.g. "Semiconductors").
# Bucket them into the 11 GICS sectors used for nav grouping.
INDUSTRY_TO_SECTOR = {
    # Technology
    "Semiconductors": "Information Technology",
    "Technology": "Information Technology",
    "Software": "Information Technology",
    "Hardware": "Information Technology",
    "Electronic Equipment, Instruments and Components": "Information Technology",
    "IT Services": "Information Technology",
    "Communications": "Communication Services",
    "Media": "Communication Services",
    "Telecommunication": "Communication Services",
    # Health Care
    "Pharmaceuticals": "Health Care",
    "Biotechnology": "Health Care",
    "Health Care": "Health Care",
    "Health Care Equipment & Services": "Health Care",
    "Life Sciences Tools & Services": "Health Care",
    "Medical Devices": "Health Care",
    # Financials
    "Banking": "Financials",
    "Banks": "Financials",
    "Insurance": "Financials",
    "Capital Markets": "Financials",
    "Financial Services": "Financials",
    "Diversified Financial Services": "Financials",
    # Consumer
    "Retail": "Consumer Discretionary",
    "Consumer products": "Consumer Discretionary",
    "Hotels, Restaurants & Leisure": "Consumer Discretionary",
    "Textiles, Apparel & Luxury Goods": "Consumer Discretionary",
    "Auto Components": "Consumer Discretionary",
    "Automobiles": "Consumer Discretionary",
    "Food, Beverage & Tobacco": "Consumer Staples",
    "Food Products": "Consumer Staples",
    "Beverages": "Consumer Staples",
    "Household Products": "Consumer Staples",
    "Personal Products": "Consumer Staples",
    # Industrials
    "Industrials": "Industrials",
    "Aerospace & Defense": "Industrials",
    "Machinery": "Industrials",
    "Building Products": "Industrials",
    "Transportation": "Industrials",
    "Airlines": "Industrials",
    "Logistics & Transportation": "Industrials",
    "Construction & Engineering": "Industrials",
    "Electrical Equipment": "Industrials",
    "Professional Services": "Industrials",
    "Commercial Services & Supplies": "Industrials",
    "Road & Rail": "Industrials",
    "Trading Companies & Distributors": "Industrials",
    "Industrial Conglomerates": "Industrials",
    # Materials (extra)
    "Packaging": "Materials",
    "Containers & Packaging": "Materials",
    # Consumer Discretionary (extra)
    "Distributors": "Consumer Discretionary",
    "Leisure Products": "Consumer Discretionary",
    # Energy / Utilities / Materials / Real Estate
    "Energy": "Energy",
    "Oil & Gas": "Energy",
    "Utilities": "Utilities",
    "Electric Utilities": "Utilities",
    "Gas Utilities": "Utilities",
    "Water Utilities": "Utilities",
    "Materials": "Materials",
    "Chemicals": "Materials",
    "Metals & Mining": "Materials",
    "Paper & Forest Products": "Materials",
    "Real Estate": "Real Estate",
    "REITs": "Real Estate",
}


def map_industry_to_sector(industry: str) -> str:
    """Best-effort: map Finnhub industry to a GICS sector bucket."""
    if not industry:
        return ""
    # Exact match first
    if industry in INDUSTRY_TO_SECTOR:
        return INDUSTRY_TO_SECTOR[industry]
    # Substring match
    lo = industry.lower()
    for key, sector in INDUSTRY_TO_SECTOR.items():
        if key.lower() in lo or lo in key.lower():
            return sector
    return "Other"


if __name__ == "__main__":
    main()
