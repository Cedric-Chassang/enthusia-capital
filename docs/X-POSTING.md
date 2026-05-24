# Auto-posting earnings sankeys to X

Walkthrough for wiring the auto-sankey pipeline to publish a tweet with the chart image whenever a new chart is generated. Execute when you're ready.

## Architecture

Two new steps slot into the existing `.github/workflows/generate-sankey.yml` workflow:

```
generate-sankey.py (existing)
  └→ writes js/earnings-<ticker>.js
     updates company.html EARNINGS_MODULES
     appends to data/pending-review.json

NEW STEP A — render-sankey-png.py
  └→ Playwright loads company.html?t=<ticker> locally
     screenshots just the chart wrapper
     saves images/sankey-<ticker>-<period>.png

NEW STEP B — post-to-x.py
  └→ reads the new JS module's KPI / GUIDANCE constants
     composes tweet text
     uploads PNG via X API media endpoint
     posts tweet via POST /2/tweets

git commit + push (existing)
  └→ ships JS + PNG together; site picks up immediately
```

PNGs are committed to the repo so the website can also use them as Open Graph / Twitter Card social-preview images (free win — links to company pages get rich previews on Slack, X, LinkedIn, iMessage).

## Prerequisites

### 1. X developer account

1. Go to [developer.x.com](https://developer.x.com) → "Sign up" / "Apply for access"
2. Approval is usually instant for "Hobbyist" tier; can take up to 24 hours
3. Once approved, you'll have a Developer Portal at [developer.x.com/portal](https://developer.x.com/portal)

### 2. Create a Project + App

1. Developer Portal → Projects & Apps → "Create Project"
2. Name it (e.g. "Enthusia Capital")
3. Use case: "Building B2B tools and reports" or "Publishing and curation"
4. Create an App inside the project
5. App permissions: **Read and Write** (default is Read-only — must explicitly upgrade)
6. Authentication settings: **OAuth 1.0a** + "Read and write" + "Web App, Automated App or Bot"
7. Callback URL: any valid placeholder (e.g. `https://enthusiacapital.com/x-callback` — not actually used for OAuth 1.0a but the form requires one)

### 3. Generate the 4 OAuth 1.0a credentials

In the App → "Keys and Tokens" tab:

- **API Key** (also called "Consumer Key")
- **API Key Secret** (also called "Consumer Secret")
- **Access Token**
- **Access Token Secret**

These four strings together authorize tweets from *your account*. Treat them like the Anthropic / Finnhub keys — never commit.

### 4. Add to GitHub Secrets

Repo → Settings → Secrets and variables → Actions:

- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

### 5. Free-tier limits to know

| Limit | Value | Implication |
|---|---|---|
| Tweets per 30 days | 1,500 | ~50/day — comfortable for earnings posts |
| Media uploads | included | no separate cap |
| Reads (GET endpoints) | 100 / month | not used by this pipeline |
| Tweet length | 280 chars (URLs count as 23 regardless of length) | template accordingly |

## Posting-flow options

Pick one when you build:

### Option 1 — Auto-post immediately

The workflow generates the chart, renders the PNG, posts to X all in one cron run. **Zero friction; risk is that a bad LLM-generated chart goes public before you spot-check.**

Workflow shape:

```yaml
- name: Render sankey PNGs for new charts
  run: python scripts/render-sankey-png.py
- name: Post to X
  env:
    X_API_KEY: ${{ secrets.X_API_KEY }}
    X_API_KEY_SECRET: ${{ secrets.X_API_KEY_SECRET }}
    X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
    X_ACCESS_TOKEN_SECRET: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
  run: python scripts/post-to-x.py
```

### Option 2 — Auto-post after admin approval

The workflow generates and renders the PNG but stops short of posting. A new field on each `pending-review.json` entry (`xPostStatus: "pending"`) shows up in the admin page with an "Approve & Post" button. Clicking it calls a new endpoint that triggers a separate "post-approved-tweets" workflow via [`workflow_dispatch`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch).

**Highest quality control; requires building UI + a second workflow.** Best if you want the auto-pipeline to feed publication without surrendering editorial judgment.

### Option 3 — Generate PNG + tweet text, post manually

The workflow saves the PNG to `images/` and writes the tweet body to `tweets/<ticker>-<period>.txt`. You open the file on your phone, copy the text, attach the image manually in the X app.

**Simplest to build, fully manual posting.** Trade-off: friction means you'll skip days when busy.

For first deployment, **Option 3 is recommended** — gets you the rendered PNG immediately, lets you review the auto-generated framing for a few cycles, then upgrade to Option 1 or 2 once you trust the output.

## Step-by-step (Option 3 — start here)

### Step 1 — Add dependencies

`scripts/requirements.txt`:

```
playwright>=1.40
tweepy>=4.14      # only needed for Option 1 or 2; safe to add now
```

The workflow needs `playwright install chromium` once at the start of each run.

### Step 2 — Create `scripts/render-sankey-png.py`

Sketch (full file ~70 lines):

```python
"""Render PNG screenshots of newly-generated sankey charts.

Walks data/pending-review.json for entries created today (source: "auto")
that don't yet have a PNG. For each:
  - launches headless Chromium via Playwright
  - opens file:///path/to/company.html?t=<ticker>
  - waits for the .earnings-chart-wrap svg to appear
  - screenshots that element
  - writes images/sankey-<ticker>-<period>.png
"""
import asyncio, json, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(exist_ok=True)

def needs_png(item):
    if item.get("source") != "auto": return False
    img = item.get("imagePath")
    if img and (ROOT / img).exists(): return False
    gen_at = datetime.fromisoformat(item["generatedAt"].rstrip("Z")).replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - gen_at < timedelta(days=2)

async def main():
    pending = json.loads((ROOT / "data" / "pending-review.json").read_text())
    todo = [it for it in pending["items"] if needs_png(it)]
    if not todo:
        print("No new charts to render.")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for item in todo:
            ticker = item["ticker"]
            period_slug = re.sub(r"\W+", "-", item["period"].lower())
            out = IMG_DIR / f"sankey-{ticker.lower()}-{period_slug}.png"
            url = (ROOT / "company.html").as_uri() + f"?t={ticker}"
            page = await browser.new_page(viewport={"width": 1100, "height": 800})
            await page.goto(url)
            chart = page.locator(".earnings-chart-wrap svg").first
            await chart.wait_for(state="visible", timeout=15000)
            await chart.screenshot(path=str(out), omit_background=False)
            print(f"  {ticker}: wrote {out.name}")
            item["imagePath"] = f"images/{out.name}"
            await page.close()
        await browser.close()

    pending["lastUpdated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (ROOT / "data" / "pending-review.json").write_text(json.dumps(pending, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
```

### Step 3 — Create `scripts/compose-tweet.py`

Sketch:

```python
"""Compose tweet text for new auto-generated sankey charts.

Parses the KPI and GUIDANCE constants out of each newly-generated
earnings-<ticker>.js, then writes a draft tweet body to
tweets/<ticker>-<period>.txt.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TW_DIR = ROOT / "tweets"
TW_DIR.mkdir(exist_ok=True)
URL_BASE = "https://enthusiacapital.com"

def extract_constants(js_text):
    """Extract KPI array and GUIDANCE object literals from a JS module."""
    # KPI: const KPI = [ { label: "...", actual: "...", est: "..." or null, beat: true/false/null }, ... ];
    kpi_match = re.search(r"const\s+KPI\s*=\s*(\[.*?\]);", js_text, re.S)
    guid_match = re.search(r"const\s+GUIDANCE\s*=\s*(\{[^}]+\}|null)", js_text, re.S)
    # Hand-parse since JS literals aren't valid JSON (no quoted keys, trailing commas)
    # …simplified parser omitted for brevity…
    return parsed_kpi, parsed_guidance

def compose(item):
    js_text = (ROOT / item["modulePath"]).read_text()
    kpi, guidance = extract_constants(js_text)
    ticker = item["ticker"]
    period = item["period"]
    rev    = next((k for k in kpi if "Revenue" in k["label"]), None)
    eps    = next((k for k in kpi if "EPS" in k["label"]), None)
    beat_emoji = lambda b: "🟢" if b is True else "🔴" if b is False else "⚪"

    lines = [f"${ticker} {period} income statement", ""]
    if rev:
        line = f"📊 Revenue: {rev['actual']}"
        if rev.get("est"): line += f" (vs {rev['est']} est) {beat_emoji(rev['beat'])}"
        lines.append(line)
    if eps:
        line = f"💰 {eps['label']}: {eps['actual']}"
        if eps.get("est"): line += f" (vs {eps['est']} est) {beat_emoji(eps['beat'])}"
        lines.append(line)
    if guidance and guidance.get("value"):
        lines.append(f"📈 Guide: {guidance['value']}")
    lines.append("")
    lines.append(f"{URL_BASE}/company.html?t={ticker}")

    return "\n".join(lines)

# …iterate over pending-review.json items, write tweets/<ticker>-<period>.txt…
```

### Step 4 — Wire into the workflow

Append to `.github/workflows/generate-sankey.yml`:

```yaml
      - name: Install Playwright
        run: |
          pip install playwright
          playwright install chromium --with-deps

      - name: Render sankey PNGs
        run: python scripts/render-sankey-png.py

      - name: Compose tweet drafts
        run: python scripts/compose-tweet.py

      - name: Commit and push (extended)
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "${{ secrets.GIT_USER_EMAIL }}"
          git add js/earnings-*.js data/pending-review.json data/calendar.json company.html images/ tweets/
          if ! git diff --staged --quiet; then
            git commit -m "chore(data): daily sankey + calendar + images + tweet drafts"
            git push
          fi
```

### Step 5 — Verify the first time it runs

After the daily cron fires (or after you trigger "Generate sankey charts" manually):

1. Pull the latest from your repo
2. Check `images/` — a new `sankey-<ticker>-<period>.png` should be there
3. Check `tweets/` — a new `<ticker>-<period>.txt` with the draft body
4. Read the txt, open the PNG, copy-paste into X app on your phone, post

If that flow feels right after 3-5 cycles, graduate to Option 1.

## Graduating to Option 1 (auto-post)

When you trust the pipeline:

### Step A — Add `scripts/post-to-x.py`

```python
"""Post pending tweet drafts to X.

For each tweets/<ticker>-<period>.txt that doesn't have a matching
.posted sibling file, attach the corresponding PNG and post to X via
tweepy. Write <ticker>-<period>.txt.posted with the returned tweet URL.
"""
import os
from pathlib import Path
import tweepy

ROOT = Path(__file__).resolve().parent.parent
TW_DIR = ROOT / "tweets"
IMG_DIR = ROOT / "images"

auth = tweepy.OAuth1UserHandler(
    os.environ["X_API_KEY"],
    os.environ["X_API_KEY_SECRET"],
    os.environ["X_ACCESS_TOKEN"],
    os.environ["X_ACCESS_TOKEN_SECRET"],
)
api_v1  = tweepy.API(auth)                 # for media upload (v1.1)
client  = tweepy.Client(                   # for posting (v2)
    consumer_key=os.environ["X_API_KEY"],
    consumer_secret=os.environ["X_API_KEY_SECRET"],
    access_token=os.environ["X_ACCESS_TOKEN"],
    access_token_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
)

for txt in TW_DIR.glob("*.txt"):
    if txt.with_suffix(".txt.posted").exists():
        continue
    # Look up matching PNG (same stem)
    png = IMG_DIR / f"sankey-{txt.stem}.png"
    if not png.exists():
        print(f"  no PNG for {txt.name}, skipping")
        continue
    media = api_v1.media_upload(filename=str(png))
    response = client.create_tweet(text=txt.read_text(), media_ids=[media.media_id])
    tweet_url = f"https://x.com/i/web/status/{response.data['id']}"
    txt.with_suffix(".txt.posted").write_text(tweet_url)
    print(f"  posted: {tweet_url}")
```

### Step B — Append to workflow

```yaml
      - name: Post drafts to X
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_KEY_SECRET: ${{ secrets.X_API_KEY_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_TOKEN_SECRET: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
        run: python scripts/post-to-x.py
```

The `.posted` marker files prevent double-posting on workflow re-runs.

## Open Graph / Twitter Card preview tags (bonus)

While you're rendering PNGs anyway, add social-preview meta tags to `company.html` so that links to the company page get rich previews on every platform (X, Slack, LinkedIn, iMessage, WhatsApp, Discord, etc.):

```html
<!-- Inside <head> -->
<meta property="og:title" content="…company name…"/>
<meta property="og:description" content="…period earnings summary…"/>
<meta property="og:image" content="https://enthusiacapital.com/images/sankey-…ticker…-…period….png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="https://enthusiacapital.com/images/sankey-…ticker…-…period….png"/>
```

This requires populating the meta tags server-side or via JS at page-load time. Since this is a static site, simplest is to let the JS inject them after `loadData()` finishes — though most scrapers (X, Slack) don't execute JS, so for best results you'd want the workflow to also rewrite `company.html` per-ticker. Out of scope for the basic posting pipeline; flag it as a follow-up.

## Pitfalls to watch for

- **Playwright in Actions needs `--with-deps`** — the runner needs OS-level libs (libgbm, libnss3, etc.) installed before Chromium launches. The `playwright install chromium --with-deps` invocation handles this automatically on Ubuntu runners.
- **Headless Chromium's default fonts** may differ from your dev environment. Test once locally with `playwright install chromium` and the same script to confirm the chart looks identical.
- **X rate-limit error 429** doesn't mean the post failed in a meaningful way — it means you hit the 1500/30-day or short-burst limit. The script should retry the next workflow run, not loop in place.
- **Tweet length math** — the 280-char limit counts most things character-by-character but URLs always count as 23 regardless of actual length. Your template should leave 50+ chars of margin to avoid edge-case truncation.
- **PNG file size** — X caps media uploads at 5MB for images. The current chart at 980×680px renders to ~120KB at PNG-8 compression, well under the limit. Watch this if you ever scale the chart up.
- **Don't tweet the BAD outputs.** During the LLM-generation runway, occasional charts will be subtly wrong (segment mapping, mass balance, EPS basis). Option 3's manual review surface catches these before they go public. Don't shortcut to Option 1 until you've watched 10+ generations come through cleanly.

## Estimated effort

| Phase | Time |
|---|---|
| 1. X dev account approval | up to 24h waiting |
| 2. Create App + extract 4 credentials | 15 min |
| 3. Add Playwright + tweepy + workflow steps for Option 3 | ~60 min |
| 4. First successful end-to-end test (PNG + draft.txt) | 20 min |
| 5. Graduate to Option 1 once trusted | ~30 min |
| **Total before posting** | **~2 hours** (across days, mostly waiting) |
