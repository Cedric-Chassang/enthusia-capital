// Amazon.com, Inc. (AMZN) — Q1 2026 income-statement Sankey.
// Renders into #earnings-slot on the company page.
//
// Source filing: Amazon 8-K / Q1 2026 Earnings Release filed 2026-04-29
//   https://www.sec.gov/Archives/edgar/data/0001018724/000101872426000012/amzn-20260331xex991.htm
//   https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-First-Quarter-Results/
// Period: three months ended March 31, 2026 (unaudited, $ in millions).
//
// Consensus sources (searched 2026-05-21):
//   - Revenue & EPS consensus: LSEG / Refinitiv via CNBC, Variety, Shacknews
//     (Revenue $177.3B, EPS $1.63 ahead of print)
//   - Q2 2026 revenue consensus $188.9B (LSEG, per Yahoo Finance / Reuters coverage)
//   - AWS consensus $36.64B–$36.80B (S&P Global preview)
//
// Caveats / arithmetic notes:
//   * Amazon does NOT report a gross-profit line. For the Sankey we derive
//     "Gross Profit" = Total Revenue − Cost of sales = 181,587 − 87,463 = 94,124.
//     The Gross-Margin KPI uses this derived figure (51.8%).
//   * Q1 2026 net income of $30.3B materially exceeds Q1 op income ($23.9B)
//     because it includes a pre-tax $16.8B mark-to-market gain on Amazon's
//     Anthropic investment (non-operating). The Sankey terminates at the
//     col-4 opex breakdown; net income / EPS sit in the KPI strip only.
//   * Col-0 uses the three reporting segments (NA, International, AWS) — these
//     sum exactly to total net sales. The product/service sub-lines (Online
//     stores, 3P seller, Subscription, Advertising, etc.) are an alternative
//     disclosure and are NOT used here.
//   * Col-4 has 5 terminal opex nodes: Fulfillment, Technology & Infrastructure,
//     Sales & Marketing, G&A, Other operating expense. They sum to 70,204M,
//     which plus Op. Income 23,920M = 94,124M = derived Gross Profit. ✓
//   * prev_q (Q4 2025) only set for segment-level / top-line figures where
//     disclosed; sub-opex prev_q is null because Amazon's Q4 press release
//     reports an annual cumulative table for those lines.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // All values in $ millions unless noted.
  const NODES = [
    // col 0 — three reporting segments (sum = 181,587 = total net sales)
    { id: "north_america", label: "North America",      value: 104141, prev_q: 127100, prev_y: 92887,  col: 0, color: "#3b82f6" },
    { id: "international", label: "International",      value: 39830,  prev_q: 50657,  prev_y: 33513,  col: 0, color: "#3b82f6" },
    { id: "aws",           label: "AWS",                value: 37616,  prev_q: 35643,  prev_y: 29267,  col: 0, color: "#3b82f6" },

    // col 1 — total revenue
    { id: "total_rev",     label: "Net Sales",          value: 181587, prev_q: 213400, prev_y: 155667, col: 1, color: "#2563a8" },

    // col 2 — derived gross-level split (Amazon doesn't report GP; derived = NetSales − CostOfSales)
    { id: "gross_profit",  label: "Gross Profit*",      value: 94124,  prev_q: null,   prev_y: 78691,  col: 2, color: "#16a34a" },
    { id: "cost_rev",      label: "Cost of Sales",      value: 87463,  prev_q: null,   prev_y: 76976,  col: 2, color: "#dc2626" },

    // col 3 — operating split
    { id: "op_income",     label: "Op. Income",         value: 23920,  prev_q: 25018,  prev_y: 18405,  col: 3, color: "#15803d" },
    { id: "op_expenses",   label: "Op. Expenses",       value: 70204,  prev_q: null,   prev_y: 60286,  col: 3, color: "#b91c1c" },

    // col 4 — five terminal opex nodes (sum = 70,204)
    { id: "fulfillment",   label: "Fulfillment",        value: 27289,  prev_q: null,   prev_y: 24593,  col: 4, color: "#b91c1c" },
    { id: "tech_infra",    label: "Tech & Infra.",      value: 29567,  prev_q: null,   prev_y: 22994,  col: 4, color: "#b45309" },
    { id: "sales_mktg",    label: "Sales & Marketing",  value: 10314,  prev_q: null,   prev_y: 9763,   col: 4, color: "#7c3aed" },
    { id: "ga",            label: "G&A",                value: 2587,   prev_q: null,   prev_y: 2628,   col: 4, color: "#0369a1" },
    { id: "other_opex",    label: "Other Op.",          value: 447,    prev_q: null,   prev_y: 308,    col: 4, color: "#991b1b" },
  ];

  const LINKS = [
    { s: "north_america", t: "total_rev",    v: 104141 },
    { s: "international", t: "total_rev",    v: 39830 },
    { s: "aws",           t: "total_rev",    v: 37616 },
    { s: "total_rev",     t: "gross_profit", v: 94124 },
    { s: "total_rev",     t: "cost_rev",     v: 87463 },
    { s: "gross_profit",  t: "op_income",    v: 23920 },
    { s: "gross_profit",  t: "op_expenses",  v: 70204 },
    { s: "op_expenses",   t: "fulfillment",  v: 27289 },
    { s: "op_expenses",   t: "tech_infra",   v: 29567 },
    { s: "op_expenses",   t: "sales_mktg",   v: 10314 },
    { s: "op_expenses",   t: "ga",           v: 2587 },
    { s: "op_expenses",   t: "other_opex",   v: 447 },
  ];

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // KPI strip — Source: LSEG consensus via CNBC / Variety / Shacknews (searched 2026-05-21).
  // Gross Margin shown is DERIVED (Net Sales − Cost of Sales) ÷ Net Sales; Amazon does
  // not publish a gross-profit line and Wall Street typically tracks operating margin.
  // No formal Street consensus exists for Amazon "gross margin" → est: null.
  // EPS actual $2.78 includes ~$1.10/sh non-operating gain on Anthropic investment.
  const KPI = [
    { label: "Revenue",      actual: "$181.5B", est: "$177.3B", beat: true },
    { label: "Gross Margin*", actual: "51.8%",  est: null,      beat: null },
    { label: "EPS (GAAP)",   actual: "$2.78",   est: "$1.63",   beat: true },
  ];
  const GUIDANCE = { value: "$194–199B", note: "vs. Q2 est. $188.9B (LSEG)" };

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`;
  const pct    = (v, r) => r ? ((v - r) / Math.abs(r)) * 100 : null;
  const fmtPct = p => p === null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  const pctClr = p => p === null ? "#94a3b8" : p >= 0 ? "#16a34a" : "#dc2626";
  const esc    = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ─── Arithmetic sanity check ──────────────────────────────────────────────
  (function verify() {
    const byId = Object.fromEntries(NODES.map(n => [n.id, n.value]));
    const checks = [
      { name: "segments → total_rev", expect: byId.total_rev,    got: byId.north_america + byId.international + byId.aws },
      { name: "GP + CoS = total_rev", expect: byId.total_rev,    got: byId.gross_profit + byId.cost_rev },
      { name: "OI + OpEx = GP",       expect: byId.gross_profit, got: byId.op_income + byId.op_expenses },
      { name: "opex split = OpEx",    expect: byId.op_expenses,  got: byId.fulfillment + byId.tech_infra + byId.sales_mktg + byId.ga + byId.other_opex },
    ];
    checks.forEach(c => {
      const gap = Math.abs(c.expect - c.got) / c.expect;
      if (gap > 0.01) console.warn(`[AMZN Sankey] ${c.name}: expected ${c.expect}, got ${c.got} (gap ${(gap*100).toFixed(2)}%)`);
    });
  })();

  function computeNMap() {
    const m = {};
    NODES.forEach(n => { m[n.id] = { ...n }; });
    const byCols = Array.from({ length: numCols }, () => []);
    NODES.forEach(n => byCols[n.col].push(n.id));
    const innerH = H - PAD.t - PAD.b;
    // Heights are proportional to amounts ACROSS the entire chart (global
    // pixels-per-dollar), not normalized per column. Scale is anchored to
    // the densest column (typically col 0/1/2 = total revenue).
    const colSums  = byCols.map(col => col.reduce((s, id) => s + Math.abs(m[id].value), 0));
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

  function computePaths(nMap) {
    const outOff = {}, inOff = {};
    NODES.forEach(n => { outOff[n.id] = 0; inOff[n.id] = 0; });
    return LINKS.map(lk => {
      const s = nMap[lk.s], t = nMap[lk.t];
      const h_s = Math.max(1, (lk.v / s.value) * s.h), h_t = Math.max(1, (lk.v / t.value) * t.h);
      const x1 = s.x + NODE_W, x2 = t.x;
      const sy0 = s.y + outOff[lk.s], ty0 = t.y + inOff[lk.t];
      outOff[lk.s] += h_s; inOff[lk.t] += h_t;
      const dx = x2 - x1, cp1x = x1 + dx * 0.5, cp2x = x2 - dx * 0.5;
      const d = `M${x1},${sy0} C${cp1x},${sy0} ${cp2x},${ty0} ${x2},${ty0} L${x2},${ty0 + h_t} C${cp2x},${ty0 + h_t} ${cp1x},${sy0 + h_s} ${x1},${sy0 + h_s} Z`;
      const green = ["gross_profit", "op_income", "net_income"].includes(lk.t);
      const rev   = lk.t === "total_rev";
      return {
        d,
        fill:   rev ? "rgba(59,130,246,0.18)" : green ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.17)",
        stroke: rev ? "rgba(59,130,246,0.38)" : green ? "rgba(22,163,74,0.4)" : "rgba(220,38,38,0.33)",
      };
    });
  }

  function computeLabels(nMap) {
    const outOff2 = {}, inOff2 = {};
    NODES.forEach(n => { outOff2[n.id] = 0; inOff2[n.id] = 0; });
    const flowTops = {};
    LINKS.forEach(lk => {
      const s = nMap[lk.s], t = nMap[lk.t];
      const h_s = Math.max(1, (lk.v / s.value) * s.h), h_t = Math.max(1, (lk.v / t.value) * t.h);
      const sy0 = s.y + outOff2[lk.s], ty0 = t.y + inOff2[lk.t];
      outOff2[lk.s] += h_s; inOff2[lk.t] += h_t;
      if (flowTops[lk.s] === undefined || sy0 < flowTops[lk.s]) flowTops[lk.s] = sy0;
      if (flowTops[lk.t] === undefined || ty0 < flowTops[lk.t]) flowTops[lk.t] = ty0;
    });
    const result = [];
    NODES.forEach(n => {
      const nd = nMap[n.id]; if (!nd) return;
      const isLeft = n.col === 0, isRight = n.col === numCols - 1;
      const qoq = pct(n.value, n.prev_q), yoy = pct(n.value, n.prev_y);
      const nodeMidY = nd.y + nd.h / 2;
      const lines = [
        { text: n.label,              size: 11,  weight: 600, fill: "#0f172a" },
        { text: fmtVal(n.value),      size: 10,  weight: 400, fill: "#334155" },
        { text: `QoQ  ${fmtPct(qoq)}`, size: 9.5, weight: 400, fill: pctClr(qoq) },
        { text: `YoY  ${fmtPct(yoy)}`, size: 9.5, weight: 400, fill: pctClr(yoy) },
      ];
      const blockStartY = nodeMidY - lines.length * LH / 2;
      if (isLeft) {
        const x = nd.x - 14;
        lines.forEach((l, i) => result.push({ ...l, x, y: blockStartY + i * LH + LH * 0.8, anchor: "end" }));
      } else if (isRight) {
        const x = nd.x + NODE_W + 14;
        lines.forEach((l, i) => result.push({ ...l, x, y: blockStartY + i * LH + LH * 0.8, anchor: "start" }));
      } else {
        const cx = nd.x + NODE_W / 2;
        const isCost = ["cost_rev", "op_expenses"].includes(n.id);
        if (isCost) {
          const o3 = {}, i3 = {};
          NODES.forEach(nn => { o3[nn.id] = 0; i3[nn.id] = 0; });
          let flowBottom = nd.y + nd.h;
          LINKS.forEach(lk => {
            const s = nMap[lk.s], t = nMap[lk.t];
            const h_s = Math.max(1, (lk.v / s.value) * s.h), h_t = Math.max(1, (lk.v / t.value) * t.h);
            if (lk.s === n.id) flowBottom = Math.max(flowBottom, s.y + o3[lk.s] + h_s);
            if (lk.t === n.id) flowBottom = Math.max(flowBottom, t.y + i3[lk.t] + h_t);
            o3[lk.s] += h_s; i3[lk.t] += h_t;
          });
          lines.forEach((l, i) => result.push({ ...l, x: cx, y: flowBottom + 10 + i * LH + LH * 0.8, anchor: "middle" }));
        } else {
          const topOfFlows = flowTops[n.id] !== undefined ? flowTops[n.id] : nd.y;
          const blockEndY = topOfFlows - 10;
          lines.forEach((l, i) => result.push({ ...l, x: cx, y: blockEndY - (lines.length - 1 - i) * LH, anchor: "middle" }));
        }
      }
    });
    return result;
  }

  function buildSVG() {
    const nMap   = computeNMap();
    const paths  = computePaths(nMap);
    const lbls   = computeLabels(nMap);
    const legY   = H - 14;
    const legW   = LEGEND.length * 130;
    const legX   = (W - legW) / 2;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">

      <rect x="0" y="0" width="${W}" height="${TITLE_H}" fill="#f8fafc"/>
      <line x1="0" y1="${TITLE_H}" x2="${W}" y2="${TITLE_H}" stroke="#e2e8f0" stroke-width="1"/>

      <text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">Q1 2026 Income Statement</text>
      <text x="${W / 2}" y="38" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">Period ending March 31, 2026 · Unaudited · $ in millions</text>

      <rect x="0" y="${TITLE_H}" width="${W}" height="${METRICS_H}" fill="#fafbfd"/>
      <line x1="0" y1="${TITLE_H + METRICS_H}" x2="${W}" y2="${TITLE_H + METRICS_H}" stroke="#e2e8f0" stroke-width="1"/>
      <line x1="${W * 0.75}" y1="${TITLE_H + 10}" x2="${W * 0.75}" y2="${TITLE_H + METRICS_H - 10}" stroke="#e2e8f0" stroke-width="1"/>
      ${KPI.map((k, i) => {
        const cx = [122.5, 367.5, 612.5][i];
        const hasEst = k.est !== null;
        const bc = k.beat ? '#16a34a' : '#dc2626';
        const bl = k.beat ? 'Beat' : 'Miss';
        return `<text x="${cx}" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">${esc(k.label.toUpperCase())}</text>
          <text x="${cx - (hasEst ? 6 : 0)}" y="${TITLE_H + 35}" text-anchor="${hasEst ? 'end' : 'middle'}" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(k.actual)}</text>
          ${hasEst ? `<text x="${cx + 6}" y="${TITLE_H + 35}" text-anchor="start" font-size="15" font-weight="700" fill="${bc}" font-family="system-ui,sans-serif">${bl}</text>
          <text x="${cx}" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">est. ${esc(k.est)}</text>` : ''}`;
      }).join('')}
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q2 &apos;26 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Amazon Q1 2026 Earnings · ir.aboutamazon.com</text>

      ${paths.map(p => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="0.6"/>`).join('')}

      ${NODES.map(n => { const nd = nMap[n.id]; return nd ? `<rect x="${nd.x}" y="${nd.y}" width="${NODE_W}" height="${nd.h}" rx="3" fill="${n.color}" opacity="0.93"/>` : ''; }).join('')}

      ${lbls.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}" font-family="system-ui,sans-serif">${esc(l.text)}</text>`).join('')}
    </svg>`;
  }

  // ─── Download as PNG ──────────────────────────────────────────────────────
  function downloadPNG() {
    const svg = target.querySelector('svg');
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const img = new Image();
    const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'amzn_q1_2026.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_AMZN = downloadPNG;

  // ─── Inject ───────────────────────────────────────────────────────────────
  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_AMZN()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;

  // Expose data for the localhost copy-paste-to-X share panel on company.html.
  window.__enthusiaEarnings = window.__enthusiaEarnings || {};
  window.__enthusiaEarnings['AMZN'] = { ticker: 'AMZN', period: 'Q1 2026', KPI, GUIDANCE, download: downloadPNG };
  window.dispatchEvent(new CustomEvent('enthusia-earnings-ready', { detail: { ticker: 'AMZN' } }));
})();
