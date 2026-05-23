"""Auto-generate earnings-sankey JS modules for covered companies that
just reported.

Pipeline:
  1. Detect new reporters from data/calendar.json (Finnhub /calendar/earnings)
  2. For each ticker in our covered universe (data/companies.json) that
     reported in the last 5 calendar days and lacks an up-to-date module:
        a. Pull SEC EDGAR companyfacts (consolidated income statement)
        b. Pull the latest 8-K earnings release HTML (segments)
        c. Pull Finnhub /stock/earnings (EPS estimate/actual)
     Bundle these into a single prompt for Claude.
  3. Call Claude API (model = claude-sonnet-4-5) with:
        - System prompt: docs/sankey-prompt.md (the canonical spec) + the
          full earnings-tsla.js as a structural template.
        - User message: the data bundle + the target file path.
        Claude returns the full JS module as its response.
  4. Write to js/earnings-<ticker>.js, append entry to
     data/pending-review.json, update data/companies.json's lastUpdated.

Usage:
  python scripts/generate-sankey.py               # auto mode (default)
  python scripts/generate-sankey.py --ticker WMT  # generate one ticker
  python scripts/generate-sankey.py --dry-run     # detect, don't generate
  python scripts/generate-sankey.py --force WMT   # regenerate even if module exists

Requires:
  ANTHROPIC_API_KEY  in .env
  FINNHUB_API_KEY    in .env
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

# ─── Paths & config ──────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
JS_DIR = ROOT / "js"
DOCS = ROOT / "docs"
LOG_FILE = ROOT / "scripts" / "generate-sankey.log"

load_dotenv(ROOT / ".env")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")

# SEC requires identifying UA with contact email
SEC_UA = "Enthusia Capital Research cedric.chassang@gmail.com"
SEC_HEADERS = {"User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate"}

REQUEST_TIMEOUT = 30
MODEL = "claude-sonnet-4-5"
LOOKBACK_DAYS = 5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("gen-sankey")


# ─── CIK lookup ──────────────────────────────────────────────────────────────
_CIK_CACHE: dict[str, str] = {}

def lookup_cik(ticker: str) -> Optional[str]:
    """Map ticker to 10-digit zero-padded CIK using SEC's tickers.json."""
    global _CIK_CACHE
    if not _CIK_CACHE:
        log.info("Loading SEC ticker→CIK map…")
        r = requests.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        for row in data.values():
            _CIK_CACHE[row["ticker"].upper()] = str(row["cik_str"]).zfill(10)
        log.info(f"  loaded {len(_CIK_CACHE)} ticker mappings")
    return _CIK_CACHE.get(ticker.upper())


def fetch_companyfacts(cik: str) -> dict:
    r = requests.get(
        f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
        headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def fetch_submissions(cik: str) -> dict:
    r = requests.get(
        f"https://data.sec.gov/submissions/CIK{cik}.json",
        headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def latest_8k_url(submissions: dict) -> Optional[str]:
    """Find the most recent 8-K with earnings-release-like primary document."""
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accs = recent.get("accessionNumber", [])
    docs = recent.get("primaryDocument", [])
    cik = submissions.get("cik", "")
    for form, acc, doc in zip(forms, accs, docs):
        if form != "8-K":
            continue
        # Heuristic: earnings releases typically have "earnings", "release",
        # "results", or "quarterly" in the primary document filename
        if re.search(r"(earning|release|result|quarterly|press)", doc, re.I):
            acc_clean = acc.replace("-", "")
            return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{doc}"
    return None


def fetch_filing_html(url: str) -> str:
    r = requests.get(url, headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.text


def strip_html(html: str) -> str:
    text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S | re.I)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&#160;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_finnhub_eps(ticker: str) -> list[dict]:
    if not FINNHUB_KEY:
        return []
    try:
        r = requests.get(
            "https://finnhub.io/api/v1/stock/earnings",
            params={"symbol": ticker, "token": FINNHUB_KEY},
            timeout=15,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        log.warning(f"  Finnhub EPS error for {ticker}: {e}")
        return []


# ─── XBRL summariser — pulls the income-statement tags we care about ─────────
INCOME_TAGS = [
    "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
    "CostOfRevenue", "CostOfGoodsAndServicesSold", "GrossProfit",
    "OperatingExpenses", "OperatingIncomeLoss",
    "SellingGeneralAndAdministrativeExpense", "ResearchAndDevelopmentExpense",
    "NetIncomeLoss", "IncomeTaxExpenseBenefit",
    "EarningsPerShareDiluted",
]

def summarise_xbrl(facts: dict, n_periods: int = 6) -> dict:
    out = {}
    gaap = facts.get("facts", {}).get("us-gaap", {})
    for tag in INCOME_TAGS:
        if tag not in gaap:
            continue
        for unit_key in ("USD", "USD/shares"):
            if unit_key in gaap[tag].get("units", {}):
                rows = [
                    r for r in gaap[tag]["units"][unit_key]
                    if r.get("form") in ("10-Q", "10-K")
                ]
                rows.sort(key=lambda r: r.get("end", ""), reverse=True)
                # Dedupe identical (start, end) keeping first
                seen = set(); deduped = []
                for r in rows:
                    k = (r.get("start"), r.get("end"))
                    if k in seen: continue
                    seen.add(k); deduped.append(r)
                out[tag] = {
                    "unit": unit_key,
                    "rows": [
                        {"start": r.get("start"), "end": r.get("end"),
                         "val": r.get("val"), "form": r.get("form"),
                         "fy": r.get("fy"), "fp": r.get("fp")}
                        for r in deduped[:n_periods]
                    ],
                }
                break
    return out


# ─── Universe + detection ────────────────────────────────────────────────────
def load_universe() -> set[str]:
    """All tickers we've ever profiled (data/companies.json)."""
    cj = DATA / "companies.json"
    if not cj.exists(): return set()
    data = json.loads(cj.read_text(encoding="utf-8"))
    return set(data.get("companies", {}).keys())


def load_calendar() -> list[dict]:
    cj = DATA / "calendar.json"
    if not cj.exists(): return []
    return json.loads(cj.read_text(encoding="utf-8")).get("events", [])


def existing_modules() -> set[str]:
    return {p.stem.replace("earnings-", "").upper() for p in JS_DIR.glob("earnings-*.js")}


def detect_to_generate(force_ticker: Optional[str] = None) -> list[dict]:
    """Return list of {ticker, name, eventDate, eventHour} to generate.

    `eventHour` is Finnhub's hour code: 'bmo' | 'amc' | 'dmh' | '' — passed
    through into pending-review.json so the admin queue shows when the print
    landed relative to market hours.
    """
    if force_ticker:
        return [{"ticker": force_ticker.upper(), "name": "", "eventDate": "", "eventHour": ""}]

    universe = load_universe()
    existing = existing_modules()
    today = datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=LOOKBACK_DAYS)

    queue = []
    for event in load_calendar():
        t = event.get("symbol", "").upper()
        if t not in universe:
            continue
        if t in existing:
            # TODO: compare event date to module's reported period — skip if same
            continue
        try:
            ev_date = datetime.fromisoformat(event["date"]).date()
        except Exception:
            continue
        if ev_date < cutoff or ev_date > today + timedelta(days=1):
            continue
        queue.append({
            "ticker": t,
            "name": event.get("name", t),
            "eventDate": event.get("date", ""),
            "eventHour": (event.get("hour") or "").lower(),
        })
    return queue


# ─── Data bundle for Claude ──────────────────────────────────────────────────
def build_bundle(ticker: str) -> dict:
    """Collect everything Claude needs to generate the module."""
    log.info(f"  [{ticker}] resolving CIK…")
    cik = lookup_cik(ticker)
    if not cik:
        raise RuntimeError(f"No CIK found for {ticker}")

    log.info(f"  [{ticker}] fetching SEC companyfacts…")
    facts = fetch_companyfacts(cik)

    log.info(f"  [{ticker}] fetching SEC submissions index…")
    subs = fetch_submissions(cik)
    release_url = latest_8k_url(subs)
    release_text = ""
    if release_url:
        log.info(f"  [{ticker}] fetching release HTML: {release_url}")
        try:
            release_text = strip_html(fetch_filing_html(release_url))
            # Cap to 50k chars to keep prompt manageable
            if len(release_text) > 50000:
                release_text = release_text[:50000] + "\n…[truncated]…"
        except Exception as e:
            log.warning(f"  [{ticker}] release fetch failed: {e}")

    log.info(f"  [{ticker}] fetching Finnhub EPS history…")
    eps = fetch_finnhub_eps(ticker)

    bundle = {
        "ticker": ticker.upper(),
        "cik": cik,
        "release_url": release_url,
        "xbrl_summary": summarise_xbrl(facts),
        "release_text": release_text,
        "finnhub_eps_history": eps[:8],
    }
    return bundle


# ─── Claude call ─────────────────────────────────────────────────────────────
def load_prompt_and_template() -> tuple[str, str]:
    spec = (DOCS / "sankey-prompt.md").read_text(encoding="utf-8")
    tsla = (JS_DIR / "earnings-tsla.js").read_text(encoding="utf-8")
    pltr = (JS_DIR / "earnings-pltr.js").read_text(encoding="utf-8")
    return spec, tsla + "\n\n// ─── (above is TSLA; below is PLTR as 2nd reference) ───\n\n" + pltr


def generate_module(ticker: str, bundle: dict) -> str:
    """Call Claude API; return the JS module text."""
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic SDK not installed. Run: pip install anthropic")
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set in .env")

    spec, references = load_prompt_and_template()
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    # The spec is long; use prompt caching so repeated runs amortize the cost.
    system_blocks = [
        {
            "type": "text",
            "text": (
                "You are a financial-data visualisation engineer. Follow the spec "
                "below to generate a single self-contained JavaScript module for "
                f"ticker {ticker}. Reply with ONLY the JavaScript code — no "
                "markdown fences, no commentary outside the file's own header "
                "comment block. The reply must begin with `// ` and be valid JS."
            ),
        },
        {
            "type": "text",
            "text": "=== SANKEY GENERATION SPEC ===\n\n" + spec,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": "=== REFERENCE MODULES (TSLA canonical, PLTR secondary) ===\n\n" + references,
            "cache_control": {"type": "ephemeral"},
        },
    ]

    user_msg = (
        f"Generate js/earnings-{ticker.lower()}.js for {ticker}.\n\n"
        f"Most recent SEC 8-K release URL: {bundle.get('release_url') or '(not found)'}\n\n"
        "=== SEC EDGAR companyfacts XBRL summary (consolidated income statement) ===\n"
        f"```json\n{json.dumps(bundle['xbrl_summary'], indent=2)}\n```\n\n"
        "=== Finnhub /stock/earnings history (last 8 quarters; period uses calendar Q-end + ~2mo for fiscal mapping) ===\n"
        f"```json\n{json.dumps(bundle['finnhub_eps_history'], indent=2)}\n```\n\n"
        "=== Press-release plain text (HTML stripped; segment tables and P&L are in here) ===\n"
        f"{bundle['release_text']}\n\n"
        "Output: the full earnings-" + ticker.lower() + ".js file."
    )

    log.info(f"  [{ticker}] calling Claude ({MODEL})…")
    t0 = time.time()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=system_blocks,
        messages=[{"role": "user", "content": user_msg}],
    )
    dt = time.time() - t0

    text = "".join(b.text for b in resp.content if b.type == "text")
    usage = resp.usage
    log.info(
        f"  [{ticker}] Claude returned {len(text):,} chars in {dt:.1f}s "
        f"(in={usage.input_tokens}+{usage.cache_creation_input_tokens or 0}c, "
        f"cached_read={usage.cache_read_input_tokens or 0}, out={usage.output_tokens})"
    )

    # Light sanity: must contain expected scaffolding
    if "earnings-slot" not in text or "NODES" not in text or "LINKS" not in text:
        raise RuntimeError("Claude response failed sanity check (missing scaffolding)")

    return text


# ─── Pending-review queue ────────────────────────────────────────────────────
def parse_period_from_module(text: str) -> str:
    """Extract the period label from the file's first comment line."""
    m = re.match(r"//\s*[\w.()]+\s+(Q\d+\s*(?:FY)?\d{2,4}|FY\s*\d{2,4})", text)
    return m.group(1) if m else "(period TBD)"


def append_pending(ticker: str, name: str, module_path: str, period: str,
                   report_date: str = "", report_time: str = ""):
    pf = DATA / "pending-review.json"
    data = {"items": []}
    if pf.exists():
        try: data = json.loads(pf.read_text(encoding="utf-8"))
        except Exception: pass
    data.setdefault("items", [])
    # Replace any existing entry for this ticker
    data["items"] = [it for it in data["items"] if it.get("ticker") != ticker]
    data["items"].append({
        "ticker": ticker,
        "name": name,
        "period": period,
        "reportDate": report_date,
        "reportTime": report_time,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "auto",
        "modulePath": module_path.replace("\\", "/"),
    })
    data["lastUpdated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pf.write_text(json.dumps(data, indent=2), encoding="utf-8")


def register_module_in_company_html(ticker: str):
    """Add the ticker to company.html's EARNINGS_MODULES map if missing."""
    ch = ROOT / "company.html"
    text = ch.read_text(encoding="utf-8")
    if f"{ticker.upper()}:" in text and f"earnings-{ticker.lower()}.js" in text:
        log.info(f"  [{ticker}] already registered in company.html")
        return
    needle = "  };"
    insertion = f"    {ticker.upper():<5} 'js/earnings-{ticker.lower()}.js',\n"
    # Replace the const block's closing brace; find it after EARNINGS_MODULES
    idx = text.find("const EARNINGS_MODULES")
    if idx < 0:
        log.warning(f"  [{ticker}] could not locate EARNINGS_MODULES; skipping registration")
        return
    end = text.find("};", idx)
    if end < 0:
        log.warning(f"  [{ticker}] could not locate closing brace of EARNINGS_MODULES")
        return
    new_text = text[:end] + insertion + text[end:]
    ch.write_text(new_text, encoding="utf-8")
    log.info(f"  [{ticker}] registered in company.html EARNINGS_MODULES")


# ─── Lookup company name ─────────────────────────────────────────────────────
def lookup_company_name(ticker: str) -> str:
    cj = DATA / "companies.json"
    if not cj.exists(): return ticker
    data = json.loads(cj.read_text(encoding="utf-8"))
    return data.get("companies", {}).get(ticker.upper(), {}).get("name") or ticker


# ─── Main ────────────────────────────────────────────────────────────────────
def run_one(ticker: str, dry_run: bool = False, force: bool = False,
            event_date: str = "", event_hour: str = "") -> bool:
    ticker = ticker.upper()
    out_path = JS_DIR / f"earnings-{ticker.lower()}.js"
    if out_path.exists() and not force:
        log.info(f"[{ticker}] module already exists at {out_path.name} — use --force to regenerate")
        return False

    log.info(f"[{ticker}] starting…")
    bundle = build_bundle(ticker)

    if dry_run:
        log.info(f"[{ticker}] dry-run: would call Claude with bundle of "
                 f"{len(bundle.get('release_text',''))} release chars + "
                 f"{len(bundle.get('xbrl_summary',{}))} XBRL tags")
        return True

    js = generate_module(ticker, bundle)
    # Strip any accidental ```js fences
    js = re.sub(r"^```(?:js|javascript)?\s*\n", "", js)
    js = re.sub(r"\n```\s*$", "", js)
    out_path.write_text(js, encoding="utf-8")
    log.info(f"[{ticker}] wrote {out_path}")

    name = lookup_company_name(ticker)
    period = parse_period_from_module(js)
    append_pending(
        ticker, name, f"js/earnings-{ticker.lower()}.js", period,
        report_date=event_date, report_time=event_hour,
    )
    register_module_in_company_html(ticker)
    log.info(f"[{ticker}] done — period={period}")
    return True


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ticker", help="generate one ticker explicitly (e.g. WMT)")
    p.add_argument("--dry-run", action="store_true", help="detect + bundle but don't call Claude")
    p.add_argument("--force", action="store_true", help="regenerate even if module already exists")
    args = p.parse_args()

    if not ANTHROPIC_KEY and not args.dry_run:
        log.error("ANTHROPIC_API_KEY not set in .env — set it before running (or use --dry-run)")
        sys.exit(2)

    queue = detect_to_generate(force_ticker=args.ticker)
    if not queue:
        log.info("Nothing to generate. (No covered tickers reported in the last "
                 f"{LOOKBACK_DAYS} days without an existing module.)")
        return

    log.info(f"Queue: {[q['ticker'] for q in queue]}")
    for item in queue:
        try:
            run_one(
                item["ticker"], dry_run=args.dry_run, force=args.force,
                event_date=item.get("eventDate", ""),
                event_hour=item.get("eventHour", ""),
            )
        except Exception as e:
            log.error(f"[{item['ticker']}] FAILED: {e}", exc_info=True)


if __name__ == "__main__":
    main()
