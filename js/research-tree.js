// Shared loader and renderers for market.html / sector.html / company.html
// Reads data/companies.json (refreshed monthly by scripts/refresh-data.py).

const INDEX_NAMES = {
  sp500:       'S&P 500',
  nasdaq100:   'NASDAQ 100',
  russell2000: 'Russell 2000',
};

const INDEX_DESCRIPTIONS = {
  sp500:       'The S&P 500 tracks the 500 largest publicly traded U.S. companies by market capitalisation, representing roughly 80% of total U.S. equity market value.',
  nasdaq100:   'The NASDAQ 100 comprises the 100 largest non-financial companies listed on the Nasdaq Stock Market, skewed heavily toward technology, communications and consumer discretionary.',
  russell2000: 'The Russell 2000 measures the performance of approximately 2,000 small-capitalisation U.S. companies, serving as the most widely followed benchmark for U.S. small-cap equity.',
};

// 11 GICS sectors with icons + brief descriptions + background images
// Images are from Unsplash (royalty-free under Unsplash License, no attribution required).
const UNSPLASH = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=70`;
const SECTORS = [
  { key: 'Information Technology', icon: 'ti-cpu',           image: UNSPLASH('1518770660439-4636190af475'), desc: 'Software, hardware, semiconductors, IT services and electronic equipment.' },
  { key: 'Communication Services', icon: 'ti-broadcast',     image: UNSPLASH('1611162617474-5b21e879e113'), desc: 'Telecommunications, media, entertainment and interactive media providers.' },
  { key: 'Consumer Discretionary', icon: 'ti-shopping-bag',  image: UNSPLASH('1483985988355-763728e1935b'), desc: 'Goods and services that are non-essential — autos, apparel, leisure, retail.' },
  { key: 'Consumer Staples',       icon: 'ti-shopping-cart', image: UNSPLASH('1542838132-92c53300491e'), desc: 'Essential goods including food, beverages, household products and personal care.' },
  { key: 'Financials',             icon: 'ti-building-bank', image: UNSPLASH('1601597111158-2fceff292cdc'), desc: 'Banks, insurance, capital markets and diversified financial services.' },
  { key: 'Health Care',            icon: 'ti-heartbeat',     image: UNSPLASH('1576091160550-2173dba999ef'), desc: 'Pharmaceuticals, biotechnology, medical devices and health care services.' },
  { key: 'Industrials',            icon: 'ti-tools',         image: UNSPLASH('1530124566582-a618bc2615dc'), desc: 'Aerospace, defence, machinery, transportation and commercial services.' },
  { key: 'Energy',                 icon: 'ti-flame',         image: UNSPLASH('1466611653911-95081537e5b7'), desc: 'Oil, gas, consumable fuels and energy equipment and services.' },
  { key: 'Utilities',              icon: 'ti-bolt',          image: UNSPLASH('1497435334941-8c899ee9e8e9'), desc: 'Electric, gas, water and multi-utility companies.' },
  { key: 'Materials',              icon: 'ti-atom',          image: UNSPLASH('1573164574001-518958d9baa2'), desc: 'Chemicals, metals & mining, paper, packaging and construction materials.' },
  { key: 'Real Estate',            icon: 'ti-building',      image: UNSPLASH('1486406146926-c627a92ad1ab'), desc: 'Real estate investment trusts (REITs) and real estate management & development.' },
  { key: 'Other',                  icon: 'ti-dots',          image: UNSPLASH('1554260570-9140fd3b7614'), desc: 'Companies not yet classified into one of the 11 GICS sectors.' },
];

// ── Data loading (cached for session) ────────────────────────────────────
const DATA_KEY = 'enthusia-companies-v1';

async function loadData() {
  const cached = sessionStorage.getItem(DATA_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { sessionStorage.removeItem(DATA_KEY); }
  }
  const r = await fetch('data/companies.json');
  if (!r.ok) throw new Error('data-missing');
  const data = await r.json();
  try { sessionStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (_) {}
  return data;
}

// ── Utilities ────────────────────────────────────────────────────────────
function qp(name) {
  return new URLSearchParams(location.search).get(name);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function firstInitial(name) {
  const m = (name || '').match(/[A-Za-z0-9]/);
  return m ? m[0].toUpperCase() : '·';
}

// Returns HTML for either a real logo or a monogram fallback
function logoHTML(company, sizeClass) {
  // sizeClass: 'co-logo' for hero (48px) or 'co-thumb' for cards (36px)
  const monoClass = sizeClass === 'co-logo' ? 'co-monogram' : 'co-mono';
  if (company.logo) {
    // Use error fallback to a monogram if the logo URL 404s
    const initial = firstInitial(company.name);
    return `<img class="${sizeClass}" src="${esc(company.logo)}" alt="" onerror="this.outerHTML='<span class=\\'${monoClass}\\'>${esc(initial)}</span>'">`;
  }
  return `<span class="${monoClass}">${esc(firstInitial(company.name))}</span>`;
}

// ── Number formatters for hero stats ─────────────────────────────────────
// marketCap and sharesOutstanding are stored in millions (Finnhub convention).
function formatMarketCap(mcInMillions) {
  const v = Number(mcInMillions);
  if (!isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'T';
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'B';
  return '$' + v.toFixed(0) + 'M';
}

function formatShares(soInMillions) {
  const v = Number(soInMillions);
  if (!isFinite(v) || v <= 0) return '—';
  if (v >= 1_000) return (v / 1_000).toFixed(2) + 'B';
  return v.toFixed(1) + 'M';
}

function formatPE(pe) {
  const v = Number(pe);
  if (!isFinite(v) || v <= 0) return '—';
  return v.toFixed(1) + 'x';
}

function formatPrice(p) {
  const v = Number(p);
  if (!isFinite(v) || v <= 0) return '—';
  return '$' + v.toFixed(2);
}

// ── Breadcrumb + meta block ──────────────────────────────────────────────
function breadcrumbHTML(items) {
  // items: [{label, href?}]
  const parts = items.map((it, i) => {
    const sep = i > 0 ? '<i class="ti ti-chevron-right"></i>' : '';
    const node = it.href ? `<a href="${esc(it.href)}">${esc(it.label)}</a>` : `<span>${esc(it.label)}</span>`;
    return sep + node;
  });
  return `<div class="breadcrumb">${parts.join('')}</div>`;
}

function metaHTML(category, lastUpdated, extraTag) {
  const tag = extraTag ? `<span class="pill-tag">${esc(extraTag)}</span>` : '';
  return `<div class="report-meta">
    <span class="pill-cat">${esc(category)}</span>
    <span class="pill-date">Updated ${esc(formatDate(lastUpdated))} &nbsp;·&nbsp; Enthusia Research</span>
    ${tag}
  </div>`;
}

// ── Helper: render error / loading state ─────────────────────────────────
function statusHTML(icon, msg) {
  return `<div class="tree-status"><i class="ti ${icon}"></i>${esc(msg)}</div>`;
}

// ── Index-level proxy tickers for the inline live quote ─────────────────
// Indices themselves aren't directly tradable, so we use commonly-referenced
// symbols that Finnhub returns valid quotes for.
const INDEX_QUOTE_SYMBOL = {
  sp500:       'SPY',   // SPDR S&P 500 ETF
  nasdaq100:   'QQQ',   // Invesco QQQ Trust — proxy for NASDAQ 100 (NDX not on Finnhub free tier)
  russell2000: 'IWM',   // iShares Russell 2000 ETF
};

// ── Live quote mount — polls /api/quote every 15s in US market hours ─────
// Drops the price + change into the given element using the same .co-quote
// styling used on company pages.
function mountLiveQuote(el, ticker) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (!node || !ticker) return;

  function isMarketOpen() {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
      if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
      const mins = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
      return mins >= 9 * 60 + 30 && mins < 16 * 60;
    } catch (_) { return true; }   // fail open
  }

  async function refresh() {
    try {
      const r = await fetch('/api/quote?ticker=' + encodeURIComponent(ticker));
      if (!r.ok) return;
      const q = await r.json();
      if (typeof q.c !== 'number' || q.c <= 0) {
        node.innerHTML = '';
        return;
      }
      const up   = (q.dp || 0) >= 0;
      const sign = up ? '+' : '';
      const cls  = (q.dp === 0) ? 'flat' : (up ? 'up' : 'down');
      const price  = '$' + q.c.toFixed(2);
      const change = sign + (q.dp || 0).toFixed(2) + '%';
      const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      node.className = 'co-quote ' + cls;
      node.title = `Last update ${ts} · open $${(q.o||0).toFixed(2)} · prev close $${(q.pc||0).toFixed(2)}`;
      node.innerHTML = `${price} <span class="co-quote-delta">(${change})</span>`;
    } catch (_) { /* silent */ }
  }
  
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


  refresh();
  setInterval(() => { if (isMarketOpen()) refresh(); }, 15000);
}

// Expose to window for inline page scripts
window.RT = {
  INDEX_NAMES, INDEX_DESCRIPTIONS, INDEX_QUOTE_SYMBOL, SECTORS,
  loadData, qp, esc, formatDate, firstInitial, logoHTML,
  breadcrumbHTML, metaHTML, statusHTML, mountLiveQuote,
  formatMarketCap, formatShares, formatPE, formatPrice,
};
