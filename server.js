const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');

// ─── Load .env (simple KEY=VALUE parser; no override of existing env vars) ────
try {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch (_) { /* .env optional */ }

// ─── /api/calendar — earnings calendar, refreshed on demand (24-hour TTL) ─────
const CALENDAR_TTL_MS = 24 * 60 * 60 * 1000;

app.get('/api/calendar', async (req, res) => {
  const calFile = path.join(DATA, 'calendar.json');

  try {
    // Serve cached if fresh
    if (fs.existsSync(calFile)) {
      const age = Date.now() - fs.statSync(calFile).mtimeMs;
      if (age < CALENDAR_TTL_MS) {
        res.setHeader('Cache-Control', 'public, max-age=600');
        return res.sendFile(calFile);
      }
    }

    const key = process.env.FINNHUB_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    const companiesPath = path.join(DATA, 'companies.json');
    if (!fs.existsSync(companiesPath)) {
      return res.status(500).json({ error: 'data/companies.json missing — run scripts/refresh-data.py first' });
    }
    const companies = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
    const universe = new Set([
      ...(companies.indices?.sp500?.tickers     || []),
      ...(companies.indices?.nasdaq100?.tickers || []),
    ]);

    // Window: today through next 10 days (covers weekend gaps so we always have 5 business days)
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today  = new Date();
    const future = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
    const from = fmt(today);
    const to   = fmt(future);

    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`;
    const fhRes = await fetch(url);
    if (!fhRes.ok) {
      return res.status(502).json({ error: 'Finnhub fetch failed', status: fhRes.status });
    }
    const fdata = await fhRes.json();

    const events = (fdata.earningsCalendar || [])
      .filter(e => universe.has(e.symbol))
      .map(e => ({
        symbol: e.symbol,
        date:   e.date,
        hour:   e.hour,  // 'bmo', 'amc', or 'dmh'
        name:   companies.companies?.[e.symbol]?.name || e.symbol,
        logo:   companies.companies?.[e.symbol]?.logo || null,
      }));

    const out = {
      lastUpdated: new Date().toISOString(),
      from, to,
      events,
    };

    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(calFile, JSON.stringify(out, null, 2));

    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(out);
  } catch (e) {
    console.error('[/api/calendar] error:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ─── /api/quote — live(-ish) price + daily change, 5-second in-memory cache ──
// Coalesces simultaneous requests so the upstream isn't hammered.
const QUOTE_TTL_MS = 5000;
const quoteCache = new Map();   // ticker -> { data, ts }

app.get('/api/quote', async (req, res) => {
  try {
    const ticker = String(req.query.ticker || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!ticker) return res.status(400).json({ error: 'ticker required' });

    const cached = quoteCache.get(ticker);
    if (cached && Date.now() - cached.ts < QUOTE_TTL_MS) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(cached.data);
    }

    const key = process.env.FINNHUB_API_KEY;
    if (!key) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });

    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'Finnhub quote failed', status: r.status });
    const data = await r.json();
    // Finnhub /quote returns { c, d, dp, h, l, o, pc, t }

    quoteCache.set(ticker, { data, ts: Date.now() });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('[/api/quote] error:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ─── /api/logo — same-origin proxy for company logos (with disk cache) ───────
// Bypasses CORS so the calendar can be exported as PNG via html2canvas.
const LOGO_DIR = path.join(DATA, 'logos');

app.get('/api/logo', async (req, res) => {
  try {
    const ticker = String(req.query.ticker || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!ticker) return res.status(400).end();

    const cachedPath = path.join(LOGO_DIR, ticker + '.png');

    // Serve from disk cache if present
    if (fs.existsSync(cachedPath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.sendFile(cachedPath);
    }

    // Look up logo URL from companies.json
    const companiesPath = path.join(DATA, 'companies.json');
    if (!fs.existsSync(companiesPath)) return res.status(404).end();
    const companies = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
    const logoUrl = companies.companies?.[ticker]?.logo;
    if (!logoUrl) return res.status(404).end();

    // Fetch from upstream
    const r = await fetch(logoUrl);
    if (!r.ok) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());

    fs.mkdirSync(LOGO_DIR, { recursive: true });
    fs.writeFileSync(cachedPath, buf);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (e) {
    console.error('[/api/logo] error:', e);
    res.status(500).end();
  }
});

// ─── /api/admin/* — Basic Auth-gated review queue ────────────────────────────
// Read by admin.html (hidden — no nav link). The pending-review queue is purely
// a notification surface for the admin to spot-check auto-generated charts; it
// does NOT gate the charts themselves (which load whenever earnings-<ticker>.js
// exists in js/). Removing an item from this queue only marks it as reviewed.
function requireAdmin(req, res, next) {
  const expectedUser = process.env.ADMIN_USER || '';
  const expectedPass = process.env.ADMIN_PASSWORD || '';
  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'admin credentials not configured' });
  }
  const auth = req.get('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (m) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
      const sep = decoded.indexOf(':');
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === expectedUser && pass === expectedPass) return next();
    } catch (_) { /* fall through to 401 */ }
  }
  res.set('WWW-Authenticate', 'Basic realm="Enthusia Admin", charset="UTF-8"');
  return res.status(401).json({ error: 'authentication required' });
}

const PENDING_FILE = path.join(DATA, 'pending-review.json');

function loadPending() {
  if (!fs.existsSync(PENDING_FILE)) return { lastUpdated: null, items: [] };
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8')); }
  catch (_) { return { lastUpdated: null, items: [] }; }
}

function savePending(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/admin/pending', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(loadPending());
});

app.use(express.json({ limit: '64kb' }));

app.post('/api/admin/pending/delete', requireAdmin, (req, res) => {
  const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : null;
  if (!tickers || !tickers.length) {
    return res.status(400).json({ error: 'tickers[] required' });
  }
  const toRemove = new Set(tickers.map(t => String(t).toUpperCase()));
  const data = loadPending();
  const before = data.items.length;
  data.items = data.items.filter(it => !toRemove.has(String(it.ticker).toUpperCase()));
  savePending(data);
  res.json({ removed: before - data.items.length, remaining: data.items.length });
});

// ─── Static files (last so /api/* takes precedence) ───────────────────────────
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`Enthusia Capital running at http://localhost:${PORT}`);
});
