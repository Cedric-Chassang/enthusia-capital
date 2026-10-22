#!/usr/bin/env node
// Builds ticker.json for the scrolling price bar (ticker.js).
// Keyless: Yahoo Finance chart API (delayed quotes). No secrets involved.
// Usage: node scripts/fetch-ticker.mjs [--prev prev.json] [--out data/ticker.json]
// A symbol that fails keeps its last REAL value from --prev (with its own
// timestamp); a symbol with no real value at all is left out. If nothing
// could be fetched the script exits 1 and writes nothing, so the published
// file is never replaced by an empty or invented one.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SYMBOLS = [
  ['S&P 500', '^GSPC'], ['NASDAQ', '^IXIC'], ['DOW', '^DJI'],
  ['AAPL', 'AAPL'], ['MSFT', 'MSFT'], ['NVDA', 'NVDA'], ['GOOGL', 'GOOGL'],
  ['META', 'META'], ['AMZN', 'AMZN'], ['TSLA', 'TSLA'],
  ['ARAMCO', '2222.SR'], ['SABIC', '2010.SR'], ['QNB', 'QNBK.QA'],
  ['GOLD', 'GC=F'], ['WTI', 'CL=F'], ['BTC', 'BTC-USD'], ['ETH', 'ETH-USD'],
];

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', 'data/ticker.json');
const PREV = arg('--prev', OUT);

let prev = {};
try {
  for (const it of JSON.parse(readFileSync(PREV, 'utf8')).items || []) prev[it.yahoo] = it;
} catch { /* no previous file */ }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function quote(yahoo) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=1d&interval=1d`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (enthusiacapital.com ticker)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.json())?.chart?.result?.[0]?.meta;
      const price = m?.regularMarketPrice, pc = m?.chartPreviousClose ?? m?.previousClose;
      if (!(price > 0) || !(pc > 0)) throw new Error('no price in response');
      return { price, prevClose: pc, change: (price / pc - 1) * 100,
               currency: m.currency || null, marketTime: m.regularMarketTime ? m.regularMarketTime * 1000 : null };
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
    }
  }
}

const items = [];
let fresh = 0;
for (const [label, yahoo] of SYMBOLS) {
  try {
    const q = await quote(yahoo);
    const r2 = x => Math.round(x * 100) / 100;
    items.push({ label, yahoo, ...q, price: r2(q.price), change: r2(q.change) });
    fresh++;
  } catch (e) {
    console.warn(`${label} (${yahoo}): ${e.message}`);
    const p = prev[yahoo], maxAge = 3 * 24 * 3600 * 1000;  // never keep a value older than 3 days
    if (p && p.marketTime && Date.now() - p.marketTime < maxAge) items.push({ ...p, stale: true });
  }
  await sleep(250);
}

if (!fresh) { console.error('No quotes fetched - leaving the published file untouched.'); process.exit(1); }
const out = { generatedAt: new Date().toISOString(), source: 'Yahoo Finance, delayed', items };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}: ${fresh} fresh, ${items.length - fresh} kept, ${SYMBOLS.length - items.length} missing`);
