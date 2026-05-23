# Deployment to GitHub Pages — step-by-step

End state: site served at `https://yourdomain.com` (or `https://<username>.github.io/<repo>`), auto-updated by GitHub Actions cron jobs that run the Python data refreshes. Free, custom-domain, HTTPS, no cold starts.

**Scope of what works on GitHub Pages:**
- ✅ All HTML pages (`index.html`, `research.html`, `company.html`, `market.html`, `sector.html`, etc.)
- ✅ All earnings-sankey modules under `js/`
- ✅ All cached data (`data/companies.json`, `data/logos/*`)
- ✅ Auto-sankey generation via GitHub Actions (Python runs in CI, commits back)
- ❌ Live ticker prices (the bar at the top — fails silently on static, can be enabled with key-in-JS if desired)
- ❌ Earnings calendar widget (if you use it — replace with static daily-built JSON)
- ❌ Admin page `/admin.html` — keep it local-only; running `node server.js` on your laptop when needed

---

## 0 — Before you start

### 0.1  Rotate the Finnhub API key

The current key in `.env` is `d87f75hr01ql0hslhjcgd87f75hr01ql0hslhjd0`. It has appeared in chat, in staging files, and is hardcoded as a fallback in `server.js`. Treat it as burnt.

1. Log in to [finnhub.io](https://finnhub.io/dashboard) → Dashboard → API Keys
2. Revoke the existing key, generate a new one
3. Put the new key in `.env` locally (don't commit it)
4. You'll add it as a GitHub Secret in Section 5

### 0.2  Get an Anthropic API key (optional, for auto-sankey)

If you want the GitHub Actions cron job to generate new sankey charts when companies report earnings:

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. You'll add it as a GitHub Secret in Section 5

If you skip this, the cron job just won't generate new charts — everything else still works.

### 0.3  Decide on a domain

- **Option A — use the free `<username>.github.io/<repo>` URL.** Zero cost, no DNS needed.
- **Option B — use a custom domain you own.** Pick one at any registrar (~$10-15/yr for a .com).

You can start with Option A and switch to Option B later for free.

### 0.4  Make sure you have Git + a GitHub account

- Git installed (`git --version`)
- GitHub account at [github.com](https://github.com)

---

## 1 — Prepare the project for static deployment

### 1.1  Update `.gitignore`

Open `.gitignore` and ensure these lines are present (this should already mostly be the case; this lists everything that must not ship):

```gitignore
# Secrets
.env
.env.*
!.env.example

# Local dev
.venv/
node_modules/
.claude/

# One-off prove-out scripts
scripts/_fetch_*.py
scripts/_parse_*.py
scripts/_test_*.py

# Generated state files
scripts/refresh-progress.json
scripts/*.log
data/staging/

# OS junk
.DS_Store
Thumbs.db
```

### 1.2  Delete the staging artefacts

```powershell
# From the project root
Remove-Item -Recurse -Force D:\Trading\website\data\staging
Remove-Item D:\Trading\website\scripts\_fetch_app.py, D:\Trading\website\scripts\_fetch_clsk.py, D:\Trading\website\scripts\_fetch_wmt.py, D:\Trading\website\scripts\_parse_app.py, D:\Trading\website\scripts\_parse_clsk.py, D:\Trading\website\scripts\_parse_wmt.py, D:\Trading\website\scripts\_parse_ubi_pdf.py, D:\Trading\website\scripts\_test_ishares.py, D:\Trading\website\scripts\refresh-progress.json, D:\Trading\website\scripts\refresh-data.log -ErrorAction SilentlyContinue
```

### 1.3  Create `.env.example` (committable template)

```env
FINNHUB_API_KEY=your-finnhub-key-here
ADMIN_USER=admin
ADMIN_PASSWORD=set-a-strong-password
ANTHROPIC_API_KEY=your-anthropic-key-here-or-leave-blank
```

This is what teammates / future-you see; the real `.env` stays out of the repo.

### 1.4  Remove the hardcoded Finnhub key fallback in `server.js`

Find this line in `server.js`:

```js
// .env optional handling — but check there's no hardcoded fallback anywhere
```

Currently `server.js` reads `process.env.FINNHUB_API_KEY` cleanly. Just verify nothing hardcodes the key. The key in `server.js` is read from `.env` only — good.

### 1.5  Make the live-quote ticker fail gracefully on static hosting

`js/research-tree.js`'s `mountLiveQuote` already silently catches errors, so the price simply stays blank on GitHub Pages. To stop the 15-second polling loop hammering 404s, add an early bailout:

Edit `js/research-tree.js`, in `mountLiveQuote`:

```js
let pollingDisabled = false;

async function refresh() {
  if (pollingDisabled) return;
  try {
    const r = await fetch('/api/quote?ticker=' + encodeURIComponent(ticker));
    if (r.status === 404) { pollingDisabled = true; return; }  // static host — give up
    if (!r.ok) return;
    // …rest of the existing body unchanged
  } catch (_) { /* silent */ }
}
```

This way the first 404 turns off polling for the page session. Optional but polite.

### 1.6  Decide what to do with `admin.html`

The admin page UI will load on GitHub Pages but the `/api/admin/*` endpoints don't exist — sign-in will fail with an HTTP error.

**Recommended:** add a static notice. Edit `admin.html`, replace the loading row with a check:

```js
// Near the top of the IIFE:
const STATIC_DEPLOY = location.hostname.endsWith('github.io')
  || (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1');

if (STATIC_DEPLOY) {
  document.querySelector('.admin-wrap').innerHTML = `
    <div class="admin-note" style="background:#fee2e2;color:#991b1b;border-color:#fecaca">
      The admin queue is only available when running the project locally
      (<code>node server.js</code> on localhost:8080).
    </div>`;
  return;
}
```

Alternatively, just delete `admin.html` from the repo before pushing — it's only useful with the Node server anyway.

---

## 2 — Push to GitHub

### 2.1  Initialise git (if not already)

```powershell
cd D:\Trading\website
git init -b main
git add .
git status   # ← verify .env, .venv, node_modules are NOT in the list
git commit -m "Initial commit"
```

### 2.2  Create the repo on GitHub

1. Go to [github.com/new](https://github.com/new)
2. Repository name: e.g. `enthusia-capital`
3. **Public** (required for free GitHub Pages, unless you have Pro)
4. Do NOT initialise with README/license/.gitignore (you already have them)
5. Click "Create repository"

### 2.3  Push

GitHub shows the exact commands on the empty-repo page. Roughly:

```powershell
git remote add origin https://github.com/<your-username>/enthusia-capital.git
git branch -M main
git push -u origin main
```

If prompted for password, use a [personal access token](https://github.com/settings/tokens) (classic, `repo` scope) — GitHub deprecated password auth years ago.

---

## 3 — Enable GitHub Pages

1. Go to your repo → Settings → Pages (left sidebar, under "Code and automation")
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Save
5. Wait ~30-90 seconds. The Pages section will then show a green check and a URL like `https://<username>.github.io/enthusia-capital/`
6. Click the URL → confirm `index.html` loads

If you see 404s for CSS / JS, check that the paths in your HTML are relative (`style.css`, not `/style.css`). The site uses relative paths throughout so this should just work.

---

## 4 — Add a custom domain (optional)

Skip this section if you're happy with the `<username>.github.io/<repo>` URL.

### 4.1  Configure DNS at your registrar

For an apex domain like `enthusiacapital.com`, add four A records:

```
@   A   185.199.108.153
@   A   185.199.109.153
@   A   185.199.110.153
@   A   185.199.111.153
```

For IPv6 (optional but recommended), add four AAAA records:

```
@   AAAA   2606:50c0:8000::153
@   AAAA   2606:50c0:8001::153
@   AAAA   2606:50c0:8002::153
@   AAAA   2606:50c0:8003::153
```

And a CNAME for the `www` subdomain pointing back to your `.github.io`:

```
www   CNAME   <username>.github.io
```

### 4.2  Tell GitHub about the domain

1. Repo → Settings → Pages → "Custom domain" field: type `enthusiacapital.com`
2. Save. GitHub creates a `CNAME` file in your repo root automatically (containing that one line).
3. Wait until the DNS check passes (5-60 min). The "Enforce HTTPS" checkbox becomes tickable.
4. **Tick "Enforce HTTPS"** — this forces all visitors onto the encrypted version.

### 4.3  (Optional) Verify domain ownership

Account-level (not repo-level) Settings → Pages → "Add a verified domain" — gives you a TXT record to add at your registrar. Once verified, only your account can claim that domain for Pages. 30 seconds, worth it.

---

## 5 — Set up GitHub Actions for the cron jobs

### 5.1  Add your secrets to the repo

Repo → Settings → Secrets and variables → Actions → "New repository secret":

- Name: `FINNHUB_API_KEY`, value: (the new key from step 0.1)
- Name: `ANTHROPIC_API_KEY`, value: (the key from step 0.2; skip if not using auto-sankey)
- Name: `GIT_USER_EMAIL`, value: (an email for the bot commits, e.g. `actions@yourdomain.com`)

### 5.2  Add the monthly refresh workflow

Create `.github/workflows/refresh-companies.yml`:

```yaml
name: Refresh companies.json
on:
  schedule:
    - cron: '0 3 1 * *'   # 1st of each month, 03:00 UTC
  workflow_dispatch: {}    # also lets you trigger manually from the Actions tab

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Run refresh-data.py
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
        run: python scripts/refresh-data.py

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "${{ secrets.GIT_USER_EMAIL }}"
          git add data/companies.json data/logos/
          if ! git diff --staged --quiet; then
            git commit -m "chore(data): monthly companies.json refresh"
            git push
          fi
```

### 5.3  Add the daily auto-sankey workflow

Create `.github/workflows/generate-sankey.yml`:

```yaml
name: Generate sankey charts
on:
  schedule:
    - cron: '0 23 * * *'   # daily 23:00 UTC (after US close)
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Refresh the earnings calendar
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
        run: |
          python -c "
          import os, json, requests
          from datetime import date, timedelta
          KEY = os.environ['FINNHUB_API_KEY']
          today, future = date.today(), date.today() + timedelta(days=10)
          comps = json.load(open('data/companies.json'))
          universe = set(comps['indices']['sp500']['tickers']) | set(comps['indices']['nasdaq100']['tickers'])
          r = requests.get(f'https://finnhub.io/api/v1/calendar/earnings?from={today}&to={future}&token={KEY}', timeout=20).json()
          events = [{'symbol': e['symbol'], 'date': e['date'], 'hour': e.get('hour',''),
                     'name': comps['companies'].get(e['symbol'], {}).get('name', e['symbol']),
                     'logo': comps['companies'].get(e['symbol'], {}).get('logo')}
                    for e in r.get('earningsCalendar', []) if e['symbol'] in universe]
          json.dump({'lastUpdated': str(today), 'from': str(today), 'to': str(future), 'events': events},
                    open('data/calendar.json','w'), indent=2)
          "

      - name: Run generate-sankey.py
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: python scripts/generate-sankey.py

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "${{ secrets.GIT_USER_EMAIL }}"
          git add js/earnings-*.js data/pending-review.json data/calendar.json company.html
          if ! git diff --staged --quiet; then
            git commit -m "chore(data): daily sankey + calendar refresh"
            git push
          fi
```

### 5.4  Push the workflows

```powershell
git add .github/
git commit -m "ci: add monthly companies refresh + daily sankey jobs"
git push
```

### 5.5  Run the workflows once manually to test

1. Repo → Actions tab → click "Refresh companies.json" → "Run workflow" → main → "Run workflow"
2. Wait, watch the run logs
3. If it succeeds and commits, you'll see a new commit on `main` from `github-actions[bot]`
4. Do the same for "Generate sankey charts"

If something fails (most common: a hardcoded path or a missing dependency), the run logs will show the exact line. Fix in your local repo, push, re-run.

---

## 6 — Verify

### 6.1  Live-site check

Visit your URL (`<username>.github.io/<repo>` or your custom domain):

- [ ] Home page loads
- [ ] `/research.html` shows the index of sectors / companies
- [ ] `/company.html?t=NVDA` shows the NVDA company page with the earnings sankey
- [ ] `/company.html?t=WMT` ditto
- [ ] `/ubi-sankey.html` and `/clsk-sankey.html` open and the chart renders
- [ ] Browser dev-tools network tab: confirm no 5xx errors. 404s on `/api/quote` are expected and harmless if you applied step 1.5; the polling stops on first 404.
- [ ] If you used a custom domain, the URL bar shows the padlock (HTTPS)

### 6.2  Cron-job sanity check

- Actions tab → both workflows show a successful run
- Look at the `data/companies.json` `lastUpdated` field — it should match today after the manual workflow run
- Look at `data/calendar.json` — it should exist and have a recent `lastUpdated`

### 6.3  After a covered ticker reports earnings (a few days)

- Daily 23:00 UTC cron fires
- New `js/earnings-<ticker>.js` gets committed
- `company.html` gets edited to include the new ticker in `EARNINGS_MODULES`
- `data/pending-review.json` gets a new entry tagged `"source": "auto"`
- Pages auto-redeploys (~1 minute after the commit)
- Visit `/company.html?t=<ticker>` — new sankey is live

---

## 7 — Day-to-day operations

| What | Where |
|---|---|
| See generated charts awaiting review | Run `node server.js` locally → open http://localhost:8080/admin.html → log in |
| Manually trigger a refresh | Repo → Actions → pick a workflow → "Run workflow" |
| Edit a chart by hand | Edit `js/earnings-<ticker>.js` locally, `git push`, Pages redeploys in ~1 min |
| Disable auto-sankey | Repo → Actions → "Generate sankey charts" → ⋯ → Disable workflow |
| Rotate the Anthropic key | Edit the GitHub Secret value, no code change needed |

---

## Common failure modes

| Symptom | Likely cause |
|---|---|
| Pages URL returns 404 | Branch / folder mismatch in Settings → Pages |
| All assets 404 | HTML using absolute paths (`/style.css` vs `style.css`) — repo isn't at the domain root if using `<username>.github.io/<repo>` style URL |
| HTTPS won't enable | DNS hasn't propagated — wait, then refresh the Pages settings page |
| Workflow fails with "permission denied" pushing | Repo → Settings → Actions → General → Workflow permissions → "Read and write permissions" |
| Workflow fails on `python scripts/refresh-data.py` | Check the run log; usually `FINNHUB_API_KEY` not set or stale companies.json missing a required tag |
| Auto-sankey workflow runs but doesn't generate anything | `data/calendar.json` empty, or no ticker reported in the last 5 days. This is normal most days. |
| `generate-sankey.py` fails with `anthropic` import error | Verify `scripts/requirements.txt` includes `anthropic>=0.40` and the workflow's `pip install` step ran |

---

## Roughly how long it takes

| Step | Time |
|---|---|
| 0 — prep (key rotation, Anthropic signup) | 10 min |
| 1 — code cleanup | 15 min |
| 2 — push to GitHub | 5 min |
| 3 — enable Pages | 5 min |
| 4 — custom domain DNS + verification | 30-60 min (mostly waiting for DNS) |
| 5 — workflows + manual test runs | 20 min |
| 6 — verification | 10 min |
| **Total first-time** | **~90 min**, of which 60 min is just waiting |
