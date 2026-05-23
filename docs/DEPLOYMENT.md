# Deployment checklist — OVH Cloud

Target: OVH hosting. Two paths depending on the tier you bought.

## 0 — Identify your tier

| OVH product | What it runs | Path |
|---|---|---|
| **Hébergement Web** (shared / "mutualisé", ≤ ~€7/mo) | Apache + PHP + MySQL, no Node, no Python | → [Path A](#path-a--shared-hosting-static-only) |
| **VPS** (≥ ~€5/mo, full root SSH) | Whatever you install | → [Path B](#path-b--vps-full-stack) |
| **Public Cloud Instance** | Same as VPS | → [Path B](#path-b--vps-full-stack) |

The OVH control panel ([www.ovh.com/manager](https://www.ovh.com/manager)) shows your products under "Hosting plans" vs "Bare Metal Cloud / VPS / Public Cloud". If you bought it via [www.ovh.com/fr/hebergement-web/](https://www.ovh.com/fr/hebergement-web/) → shared. Anything else → VPS-class.

---

## Path A — Shared hosting (static-only)

You'll lose the Node-served endpoints but the site stays ~95% functional. The lost features:

| Feature | Replacement |
|---|---|
| `/api/quote` (live price next to ticker) | Switch to direct client-side Finnhub fetch, OR disable the live quote |
| `/api/calendar` (earnings calendar widget) | Pre-build a static `data/calendar.json` locally daily, push via SFTP |
| `/api/logo` (logo proxy) | Reference `data/logos/<TICKER>.png` directly from HTML — already cached on disk |
| `/api/admin/pending` (review queue) | Keep admin **local-only** — run `node server.js` on your laptop when needed |
| Auto-sankey generation (Python + Anthropic) | Run `scripts/generate-sankey.py` locally on a cron, push generated `js/earnings-*.js` via SFTP |

### A.1 — Prepare a deploy folder locally

```powershell
# From the project root, create a clean deploy folder
mkdir D:\Trading\website-deploy
robocopy D:\Trading\website D:\Trading\website-deploy /E /XD .venv .claude node_modules data\staging scripts data\logos /XF .env package-lock.json refresh-progress.json refresh-data.log server.js
```

Result: the deploy folder contains only what shared hosting can serve.

**Files that go up:**
- `*.html` (all pages)
- `style.css`
- `ticker.js`
- `js/*.js` (research-tree + all earnings modules)
- `data/companies.json`
- `data/calendar.json` (regenerated locally, see A.4)
- `data/pending-review.json` (optional — admin queue is local-only)
- `data/logos/*.png` (pre-fetched logo cache; copy these back if you cleaned them out above)

**Files that stay home:**
- `.env`, `server.js`, `package*.json`, `node_modules/`
- `.venv/`, `scripts/`, `.claude/`
- `data/staging/`, `*.log`, `refresh-progress.json`
- `admin.html` — gets uploaded but won't work (the API behind it is gone). Either delete or keep local-only.

### A.2 — Switch the live quote off (or to direct Finnhub)

Edit `js/research-tree.js`'s `mountLiveQuote` function. Two choices:

**Option (i) — disable entirely** (cleanest):

Replace the body of `mountLiveQuote` with `return;` — the quote span next to each ticker stays empty.

**Option (ii) — direct browser → Finnhub call** (keeps the live price):

```js
async function refresh() {
  try {
    const KEY = 'd87f75hr01ql0...';   // ⚠️  visible in browser source
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${KEY}`);
    // ... rest unchanged
  } catch (_) { /* silent */ }
}
```

Trade-off: works, but the Finnhub key is exposed in browser source. For a free-tier Finnhub key this is acceptable (it's rate-limited to 60 calls/minute per IP, so abuse is bounded). For a paid key, treat as compromised — generate a separate restricted key for the front-end.

### A.3 — Replace the earnings calendar fetch

The calendar widget (if you use it) currently calls `/api/calendar`. Edit it to fetch the static file instead:

```js
const r = await fetch('/data/calendar.json');
```

Then build `data/calendar.json` locally every day (see A.4).

### A.4 — Local scheduled jobs (replace the Windows Task Scheduler entry)

Keep these running on your local machine; SFTP the outputs up.

| Cadence | Command | Output to upload |
|---|---|---|
| Monthly | `python scripts/refresh-data.py` | `data/companies.json`, `data/logos/*` |
| Daily | Run `server.js` locally → hit `/api/calendar` once → grab `data/calendar.json` | `data/calendar.json` |
| Daily | `python scripts/generate-sankey.py` (needs Anthropic key) | new `js/earnings-*.js`, updated `data/pending-review.json`, edited `company.html` |
| Per generation | Manual review on local `admin.html` | none — review-only |

Your Windows Task Scheduler entry `EnthusiaSankeyAutogen` is already set up; add a follow-up step (PowerShell) that SFTPs the changed files. Example:

```powershell
# Append to scripts/generate-sankey.py post-run, or as a separate scheduled task:
& 'C:\Program Files\Git\usr\bin\rsync.exe' -av --delete `
    /d/Trading/website/js/earnings-*.js `
    /d/Trading/website/data/companies.json `
    /d/Trading/website/data/calendar.json `
    user@ftp.cluster0XX.hosting.ovh.net:www/
```

Or use OVH's SFTP via WinSCP scripting.

### A.5 — Upload to OVH

1. **Get SFTP credentials**: OVH Control Panel → Web Hosting → Your domain → "FTP-SSH" tab. Note `ftpHost`, `username`, `password`.
2. **Connect** with FileZilla / WinSCP / `sftp`. Default upload directory is `/www/` (or `/htdocs/` on older plans).
3. **Upload** the entire contents of `D:\Trading\website-deploy\` into the host's `www/` root.
4. **Test**: `https://yourdomain.com/` should load `index.html`.

### A.6 — HTTPS

OVH includes free Let's Encrypt SSL on shared hosting.
- Control Panel → Web Hosting → Multisite → Click the lock icon next to your domain → enable SSL.
- Add an `.htaccess` at the web root to force HTTPS:

```apache
# .htaccess — force HTTPS + clean URL fallback
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
```

### A.7 — Optional .htaccess goodies

```apache
# Cache static assets aggressively
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType application/json "access plus 1 hour"
</IfModule>

# Gzip text responses
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>

# Block direct access to admin page since the API behind it doesn't run here
<Files "admin.html">
  Require all denied
</Files>
```

### A.8 — Verification checklist

- [ ] `https://yourdomain.com/` loads the home page
- [ ] Navigating to a covered ticker (`/company.html?t=NVDA`) renders the sankey
- [ ] The hero info row shows market cap, shares out, P/E, 52w range
- [ ] No 404s in the browser dev-tools network tab (check for `/api/*` calls — if any, fix per A.2/A.3)
- [ ] HTTPS shows green padlock
- [ ] `/admin.html` returns 403 (if you used the `.htaccess` block above)

---

## Path B — VPS (full stack)

If you have an OVH VPS or Public Cloud instance, everything in this project runs as-is. Rough sequence:

### B.1 — Provision

- OVH Control Panel → VPS → choose Ubuntu 22.04 or 24.04 LTS
- SSH in: `ssh ubuntu@your-vps-ip`
- Update + harden:
  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ufw fail2ban
  sudo ufw allow OpenSSH && sudo ufw allow http && sudo ufw allow https && sudo ufw enable
  ```

### B.2 — Install runtimes

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3.12 + venv
sudo apt install -y python3.12 python3.12-venv python3-pip

# Caddy (handles HTTPS + reverse proxy with one config)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### B.3 — Upload code

```bash
# From your laptop
rsync -av --exclude='.venv' --exclude='node_modules' --exclude='.claude' --exclude='data/staging' \
  /d/Trading/website/ ubuntu@your-vps-ip:/home/ubuntu/enthusia/
```

### B.4 — Set up env

```bash
ssh ubuntu@your-vps-ip
cd ~/enthusia

# Node deps
npm install --omit=dev

# Python venv
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
deactivate

# Secrets — paste your real values
cat > .env <<EOF
FINNHUB_API_KEY=...
ADMIN_USER=admin
ADMIN_PASSWORD=...
ANTHROPIC_API_KEY=...
EOF
chmod 600 .env
```

### B.5 — Run Node under systemd

`/etc/systemd/system/enthusia.service`:

```ini
[Unit]
Description=Enthusia Capital research site
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/enthusia
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now enthusia
sudo systemctl status enthusia
```

### B.6 — Caddy reverse proxy + auto-HTTPS

`/etc/caddy/Caddyfile`:

```
yourdomain.com {
    encode gzip zstd
    reverse_proxy localhost:8080

    @admin path /admin.html /api/admin/*
    handle @admin {
        # Optional: IP allowlist for admin
        # @notme not remote_ip 1.2.3.4
        # respond @notme 403
        reverse_proxy localhost:8080
    }

    log {
        output file /var/log/caddy/enthusia.log
        format console
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews the Let's Encrypt cert automatically.

### B.7 — Schedule the data jobs (cron)

```bash
crontab -e
```

Add:

```cron
# Monthly companies.json refresh — 1st of the month at 03:00 UTC
0 3 1 * * cd /home/ubuntu/enthusia && .venv/bin/python scripts/refresh-data.py

# Daily auto-sankey generation — 23:00 UTC after US close
0 23 * * * cd /home/ubuntu/enthusia && .venv/bin/python scripts/generate-sankey.py
```

### B.8 — Add minimal security middleware

Before going live, add rate-limiting on `/api/admin/*` in `server.js`:

```javascript
const rateLimit = require('express-rate-limit');
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 30,                     // 30 requests per window per IP
  message: { error: 'too many requests' },
});
app.use('/api/admin/', adminLimiter);
```

Then `npm install express-rate-limit` and restart with `sudo systemctl restart enthusia`.

### B.9 — DNS

OVH Control Panel → Domains → Your domain → DNS Zone:

- `A` record: `@` → your VPS IPv4
- `AAAA` record: `@` → your VPS IPv6 (if assigned)
- `CNAME`: `www` → `@`

Propagation: typically minutes.

### B.10 — Verification checklist

- [ ] `https://yourdomain.com/` loads (cert green)
- [ ] `https://yourdomain.com/admin.html` prompts the login overlay
- [ ] `/api/quote?ticker=NVDA` returns JSON
- [ ] `/api/calendar` returns the cached calendar JSON
- [ ] systemd shows `enthusia.service` as `active (running)`
- [ ] `sudo journalctl -u enthusia -n 50` shows no errors
- [ ] After 24 hours, `crontab -l` jobs have fired and `~/enthusia/scripts/*.log` are populated

---

## Things to do before either path

- **Strip personal email from the SEC UA in `scripts/refresh-data.py` and `scripts/generate-sankey.py`** — currently hardcoded as `cedric.chassang@gmail.com`. SEC requires a contact email but you may want a dedicated one for the production deployment.
- **Rotate your Finnhub key** if it has ever appeared in any commit, and store the new key only in `.env`.
- **Decide whether the admin queue + Anthropic key should live in production at all.** Both paths support keeping them local-only (Path A forces this; Path B is a choice). Local-only is simpler and slightly safer — no admin creds on the public-facing host.
- **Pick a domain.** OVH sells them but Cloudflare/Namecheap are usually cheaper and DNS is easier to manage.
- **Test the deploy against a staging subdomain first** (e.g. `staging.yourdomain.com`) before pointing the apex.

---

## Estimated effort

| Path | First-time deploy | Ongoing maintenance |
|---|---|---|
| A — Shared | ~2 hours (mostly tweaking research-tree.js + setting up local rsync) | ~5 min/week, plus whenever you regen content |
| B — VPS | ~3-4 hours | ~30 min/month for OS updates + monitoring |
