# Sankey earnings module — generation brief

You are a financial data visualisation engineer. Generate a single JavaScript module that renders an interactive Sankey income-statement diagram for a specific company, dropped into the existing static research site.

## Integration context

The module lives at `js/earnings-<ticker_lower>.js`. The host page (`company.html`) provides a `<div id="earnings-slot">` placeholder; when a ticker matches the `EARNINGS_MODULES` map, the page dynamically loads the corresponding module, which self-renders into that slot.

**You will NOT edit `company.html`.** The orchestrator handles registration after all modules are generated.

## Source-of-truth reference

Before doing anything else, read these two files:
- `js/earnings-tsla.js` — the canonical structural template. Your output must match this exact module shape (constants, helper functions, IIFE wrapper, SVG layout). Only the data and ticker references change.
- `js/earnings-pltr.js` — secondary reference, illustrates how to handle a KPI with `est: null` (when consensus isn't available) and a Sankey that terminates at operating income.

## Step 1 — Income statement structure (5 columns)

Identify the company's actual reporting structure. Do not impose a fixed template — the column layout must reflect how THIS company breaks down its financials.

- **col 0** — Revenue segments (sources). Use the company's own segment breakdown. Cap at 7 nodes; group smaller items into "Other" and add a code comment.
- **col 1** — Revenue aggregation. Single node "Total Revenue" (or "Net Sales" / "Net Revenue" per the company's label).
- **col 2** — Gross-level split. Two nodes: Gross Profit + Cost of Revenue. Skip this column for financials/insurance that don't report a gross profit line.
- **col 3** — Operating-level split. Two nodes: Operating Income + Total Operating Expenses.
- **col 4** — Terminal nodes: Net Income + Tax & Other + R&D + SG&A (only if separately disclosed). If R&D and SG&A aren't broken out, keep a single "Operating Expenses" terminal node.

**Verify arithmetic** for every non-terminal node (±1% tolerance). Add a `console.warn()` if any gap exceeds 1%.

## Step 2 — Data extraction

For every node, extract three values **in millions** of the reporting currency:
- `value` — current reporting period
- `prev_q` — immediately prior period (use `null` if not comparable)
- `prev_y` — same period one year ago

**Preferred data sources (in order):**
1. **SEC EDGAR XBRL Company Facts API** — `https://data.sec.gov/api/xbrl/companyfacts/CIK<10-digit-zero-padded-CIK>.json`. Has `Revenues`, `CostOfRevenue`, `GrossProfit`, `OperatingIncomeLoss`, `NetIncomeLoss`, `ResearchAndDevelopmentExpense`, `SellingGeneralAndAdministrativeExpense`, `IncomeTaxExpenseBenefit` as standardized tags. Use these for the company-level numbers.
2. **Latest 10-Q filing** — for segment-level revenue (segments are typically in footnotes, not as standard XBRL tags). Locate via `https://data.sec.gov/submissions/CIK<10-digit>.json` and fetch the filing index.
3. **Earnings press release PDF** — usually has the cleanest segment table; find via the company's IR site.

LINKS: each `{ s, t, v }` represents one flow. For every node, `Σ(outgoing v) = node.value` and `Σ(incoming v) = node.value` (terminal nodes have no outgoing links).

### KPI strip (3 metrics)

For each of Revenue, Gross Margin, EPS:

**Step A — Actuals from the filing:**
- Revenue: total revenue for the period
- Gross Margin: Gross Profit ÷ Total Revenue (use Operating Margin and relabel if no gross profit line)
- EPS: prefer Adjusted diluted EPS if the company reports it AND it's the standard Wall Street consensus metric; otherwise GAAP diluted EPS. Label "Adj. EPS" or "EPS (GAAP)" accordingly.

**Step B — Consensus estimates (web search + Finnhub):**

Read `.env` to get `FINNHUB_API_KEY`. Then try:
- `https://finnhub.io/api/v1/stock/earnings?symbol=<TICKER>&token=<KEY>` — EPS estimate/actual surprise history. The most recent entry's `estimate` field is your EPS consensus.
- Web search for revenue and gross margin consensus:
  - `[Company] [Ticker] Q[N] [Year] earnings consensus estimate revenue EPS analyst expectations beat miss Wall Street`
  - `[Company] [Ticker] Q[N] [Year] gross margin estimate analyst forecast`
- Record sources (LSEG / FactSet / Bloomberg / Finnhub) in a code comment beside the KPI block.
- If a consensus figure can't be found after two searches, set `est: null` and `beat: null`. The host renderer centres the actual value alone when est is null.

**Step C — Determine beat/miss:**
- `beat: true` if actual > est
- `beat: false` if actual < est
- `beat: null` if est is null

Format:
```js
const KPI = [
  { label: "Revenue",      actual: "$X.XB",  est: "$X.XB" or null,  beat: true/false/null },
  { label: "Gross Margin", actual: "XX.X%",  est: "XX.X%" or null,  beat: true/false/null },
  { label: "Adj. EPS",     actual: "$X.XX",  est: "$X.XX" or null,  beat: true/false/null },
];
// Source: <provider> — searched <date>
```

### Guidance

Extract company-issued guidance from the earnings release (if any). Then web search for the consensus for the guided metric (typically next-quarter revenue):
- `[Company] Q[N+1] [Year] revenue consensus estimate analyst`

Format:
```js
const GUIDANCE = { value: "$X.XB", note: "vs. Q[N+1] est. $X.XB (LSEG)" };
```

If no quantitative guidance was provided, set `GUIDANCE = null`.

## Step 3 — Visual design constants (do not change)

```js
const W = 980, H = 680;
const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
const PAD = { l:160, r:160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
const NODE_W = 20, numCols = 5, MIN_GAP = 52, LH = 14;
const NODE_SCALE = 0.60 * 0.75;
const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
```

### Node sizing — global pixels-per-dollar (critical)

Node heights must be proportional to amounts **across the entire chart**, not normalized per column. A $6B R&D node at col 4 must visually appear smaller than a $7B Operating Expenses node at col 3 that feeds it.

The `computeNMap` function must therefore use a single global scale anchored to the densest column (typically col 0/1/2 = total revenue):

```js
function computeNMap() {
  const m = {};
  NODES.forEach(n => { m[n.id] = { ...n }; });
  const byCols = Array.from({ length: numCols }, () => []);
  NODES.forEach(n => byCols[n.col].push(n.id));
  const innerH = H - PAD.t - PAD.b;
  const colSums   = byCols.map(col => col.reduce((s, id) => s + Math.abs(m[id].value), 0));
  const maxColSum = Math.max(...colSums);
  const maxCount  = byCols.reduce((mx, col) => Math.max(mx, col.length), 0);
  const maxGap    = (maxCount - 1) * MIN_GAP;
  const availH    = (innerH - maxGap) * NODE_SCALE;
  const pxPerVal  = availH / maxColSum;
  byCols.forEach((col, ci) => {
    const count = col.length;
    const totalGap = (count - 1) * MIN_GAP;
    const colH = colSums[ci] * pxPerVal;
    let y = PAD.t + (innerH - colH - totalGap) / 2;
    col.forEach((id, idx) => {
      m[id].x = getColX(ci);
      m[id].y = y;
      m[id].h = Math.max(4, Math.abs(m[id].value) * pxPerVal);
      y += m[id].h + (idx < count - 1 ? MIN_GAP : 0);
    });
  });
  return m;
}
```

Do NOT use per-column normalization (`m[id].value / col_total * availH`) — that breaks proportionality across columns.

**Node colours:**
- Revenue segments (col 0): primary `#3b82f6`, secondary/minor `#60a5fa`
- Total Revenue: `#2563a8`
- Gross Profit: `#16a34a`
- Cost of Revenue: `#dc2626`
- Operating Income: `#15803d`
- Operating Expenses (col 3): `#b91c1c`
- Net Income: `#166534`
- Tax & Other: `#991b1b`
- R&D / SG&A: `#b91c1c`
- Any additional expense node: cycle through `#b45309`, `#7c3aed`, `#0369a1`

**Flow colours:**
- Into profit nodes (gross_profit, op_income, net_income): fill `rgba(22,163,74,0.20)` stroke `rgba(22,163,74,0.40)`
- Into total_rev: fill `rgba(59,130,246,0.18)` stroke `rgba(59,130,246,0.38)`
- Cost/expense flows: fill `rgba(220,38,38,0.17)` stroke `rgba(220,38,38,0.33)`

## Step 4 — Chart header (top strip)

**No logos, no company name in the title.** The host company page already provides company identity above the section. The chart header contains only:

- Centred title at y=24: `"[Period] Income Statement"` (e.g. `"Q1 2026 Income Statement"`, `"FY 2025 Income Statement"`) — 16px, weight 700, fill `#0f172a`, text-anchor middle
- Centred subtitle at y=38: `"Period ending [date] · Unaudited · [Currency] in millions"` — 10px, fill `#64748b`, text-anchor middle

## Step 5 — KPI metrics strip

Layout:
- Left 75% = 3 KPI columns at `cx = [122.5, 367.5, 612.5]`
- Right 25% = guidance, centred at `x = 857.5`
- Vertical divider at `x = W * 0.75`

Per KPI column:
- **row 1**, y = TITLE_H + 14: label uppercase, 8.5px, weight 600, fill `#0f172a`, letter-spacing 0.8
- **row 2**, y = TITLE_H + 35: **actual + Beat/Miss side-by-side, same size**
  - actual: font-size 15, weight 700, fill `#0f172a`
  - Beat/Miss: font-size 15, weight 700, fill `#16a34a` (Beat) or `#dc2626` (Miss)
  - Layout when est ≠ null: actual `text-anchor "end" x = cx − 6`, Beat/Miss `text-anchor "start" x = cx + 6`
  - Layout when est is null: actual centred at cx, no Beat/Miss
- **row 3**, y = TITLE_H + 51: `"est. [value]"` 9px fill `#64748b`, centred at cx; omitted when est is null

No pill background — plain coloured text only.

Guidance cell (only when GUIDANCE ≠ null):
- row 1, y = TITLE_H + 14: `"Q[N+1] '[YY] GUIDANCE"` 8.5px weight 600 fill `#0f172a`
- row 2, y = TITLE_H + 33: guidance value 15px weight 700 fill `#0f172a`
- row 3, y = TITLE_H + 51: note 9px fill `#64748b`

## Step 6 — Footer

- Centre: legend swatches (130px wide each), font-size 9, fill `#475569`
- Right: `"Source: [Company] [Period] Earnings · [IR domain]"` font-size 9 fill `#94a3b8` text-anchor end at x = W − 12

## Step 7 — Module structure

Wrap everything in an IIFE that:
1. Finds `#earnings-slot`. If not present, return silently.
2. Defines all data + helpers + buildSVG.
3. Exposes `window.__downloadEarningsPNG_<TICKER_UPPER>` for the download button onclick.
4. Injects into the slot:
   ```js
   target.innerHTML = `
     <div class="earnings-chart-wrap">
       ${buildSVG()}
       <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_<TICKER_UPPER>()">
         <i class="ti ti-download"></i> Download PNG
       </button>
     </div>
   `;
   ```

SVG attributes: `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;width:100%;height:auto"`. No border or border-radius (host CSS resets).

PNG export: XMLSerializer → Blob → Image → Canvas (2×) → PNG download. Filename: `<ticker_lower>_<period_lower>.png`.

## Step 8 — Output

File: `js/earnings-<ticker_lower>.js`

Header comment at top of file must include:
- Source filing date + URL (10-Q or earnings press release)
- Consensus sources with the search date
- Any caveats (post-merger restatement, null prev_q, segment definition changes, etc.)

## Verification before reporting back

- Open the file mentally and check: are NODES, LINKS, KPI, GUIDANCE all defined? Does the IIFE wrap them? Is the `window.__downloadEarningsPNG_*` exposed?
- Arithmetic: do segment revenues sum to total revenue? Does gross profit + cost of revenue = total revenue? Does operating income + operating expenses = gross profit (or whatever the flow says)?
- KPI strip: does each entry have label/actual/est/beat? Is `est: null` handled?
- Period label: is it the company's own convention (Q1 2026, Q3 FY26, FY 2025, etc.)?

## Final report

When done, return a concise summary:
- Module path
- Period covered
- Key data: revenue / gross margin / EPS (actual vs est)
- Any caveats or data gaps
