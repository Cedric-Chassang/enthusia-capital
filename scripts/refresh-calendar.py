"""Refresh data/calendar.json from Finnhub.

Pulls the earnings calendar for the next 14 days and filters to our covered
universe (S&P 500 + NASDAQ 100). Reusable by both the daily sankey workflow
and the Sunday weekly-calendar post workflow.

Requires: FINNHUB_API_KEY in env, data/companies.json present.
"""
from __future__ import annotations
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
COMPANIES = ROOT / "data" / "companies.json"
OUT = ROOT / "data" / "calendar.json"

KEY = os.environ.get("FINNHUB_API_KEY")
if not KEY:
    sys.exit("ERROR: FINNHUB_API_KEY not set")

today = date.today()
future = today + timedelta(days=14)

data = json.loads(COMPANIES.read_text(encoding="utf-8"))
indices = data["indices"]
companies = data["companies"]
universe = set(indices["sp500"]["tickers"]) | set(indices["nasdaq100"]["tickers"])

print(f"Fetching Finnhub earnings calendar {today} -> {future} "
      f"(universe = {len(universe)} tickers)")

r = requests.get(
    "https://finnhub.io/api/v1/calendar/earnings",
    params={"from": str(today), "to": str(future), "token": KEY},
    timeout=30,
)
r.raise_for_status()
raw = r.json().get("earningsCalendar", []) or []

events = [
    {
        "symbol": e["symbol"],
        "date":   e["date"],
        "hour":   e.get("hour", ""),
        "name":   companies.get(e["symbol"], {}).get("name", e["symbol"]),
        "logo":   companies.get(e["symbol"], {}).get("logo"),
    }
    for e in raw
    if e.get("symbol") in universe
]

out = {
    "lastUpdated": today.isoformat(),
    "from": str(today),
    "to":   str(future),
    "events": events,
}
OUT.write_text(json.dumps(out, indent=2))
print(f"Wrote {OUT.relative_to(ROOT)} with {len(events)} covered reporters "
      f"(from {len(raw)} total in the window)")
