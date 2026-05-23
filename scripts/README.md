# Data refresh

Pulls constituents and profile data for S&P 500, NASDAQ 100, and Russell 2000
into `data/companies.json`, used by the dynamic Market Research pages.

## Setup (one-time)

```bash
cd <project root>
python -m venv .venv
.venv\Scripts\activate    # Windows
# or: source .venv/bin/activate   # macOS / Linux
pip install -r scripts/requirements.txt
```

Make sure `.env` exists at the project root with:

```
FINNHUB_API_KEY=<your key>
```

## Run

```bash
python scripts/refresh-data.py
```

Expected duration: ~45-60 min on first run.

The script:
1. Pulls constituents from Wikipedia (S&P 500, NASDAQ 100) and iShares IWM CSV (R2000)
2. Calls Finnhub `/stock/profile2` for each unique ticker (sector, industry, logo, website) — throttled to 55 calls/min to stay under the free-tier limit
3. Fetches a clean lead-paragraph description from Wikipedia for each company (concurrent)
4. Writes `data/companies.json`

A checkpoint file at `scripts/refresh-progress.json` is saved every 25 companies, so the script can resume after interruption.

## Refresh cadence

Run once a month. The output JSON is read client-side by the static site; nothing else changes between refreshes.

## Russell 2000 — manual CSV step

iShares serves their IWM holdings CSV through Akamai Bot Manager, which blocks automated downloads. To populate the Russell 2000 in `companies.json`, do this **once per refresh**:

1. Open in a browser: <https://www.ishares.com/us/products/239710/ishares-russell-2000-etf>
2. Scroll to **Detailed Holdings and Analytics** → click the **Download** button → CSV
3. Save the file as `data/IWM_holdings.csv` (overwrite any previous copy)
4. Run `python scripts/refresh-data.py` — it will pick up the local CSV automatically

If `data/IWM_holdings.csv` is missing, the script logs a warning and skips Russell 2000. S&P 500 and NASDAQ 100 still refresh normally.
