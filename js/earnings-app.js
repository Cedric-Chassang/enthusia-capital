// AppLovin Q1 2026 income-statement Sankey, scoped for embedding inside a
// dynamic container on the company page. Renders into #earnings-slot.
//
// Source filing: AppLovin Q1 2026 8-K (press release), period ending March 31, 2026,
//   https://www.sec.gov/Archives/edgar/data/0001751008/000175100826000042/exhibit991-1q26earningspre.htm
// Prior-quarter (Q4 2025) consolidated lines derived from XBRL Companyfacts
//   (FY25 10-K minus 9M FY25 from Q3 2025 10-Q):
//   https://data.sec.gov/api/xbrl/companyfacts/CIK0001751008.json
// Consensus sources (searched 2026-05-22): IndexBox/wires aggregate — Revenue est
//   $1.77B, Adj. EPS est $3.64. Finnhub /stock/earnings shows GAAP EPS est $3.44 vs
//   actual $3.56 (+3.55% surprise).
//
// CAVEATS:
//   1. AppLovin operates a SINGLE revenue stream post-divestiture. In early 2025 the
//      company sold its Apps (mobile games) business to Tripledot Studios; that
//      revenue is reported as discontinued operations. All Q1 2026 continuing-ops
//      revenue ($1,842M) flows from the Software Platform (advertising via AXON /
//      MAX / AppDiscovery). Col 0 therefore holds a single placeholder node — the
//      sankey would otherwise be a 4-column chart, which would break visual
//      consistency with the rest of the site.
//   2. Prev-year (Q1 2025) comparables use CONTINUING-OPS basis throughout, since
//      the income statement Q1 26 has no Apps line. Net income prev_y = $724M
//      (continuing ops); total Q1 25 net income was $576M but that includes a
//      $(147)M loss from discontinued operations not relevant to this view.
//   3. Q4 2025 (prev_q) derived by FY25 10-K − 9M FY25 10-Q arithmetic:
//        Revenue 5,480.7 − 3,822.8 = 1,657.9M
//        COR       665.1 −   481.6 =   183.5M
//        Op Inc  4,151.9 − 2,876.7 = 1,275.2M
//        R&D       226.5 −   144.3 =    82.2M
//        G&A       233.5 −   165.3 =    68.2M
//        Sales & Mktg (residual)   =    48.8M  (op_exp_total − R&D − G&A)
//        Net Inc (cont) 3,333.8 − 2,231.5 = 1,102.3M
//   4. KPI uses Adjusted EPS ($3.76) — the standard Street consensus basis for APP
//      (non-GAAP, excludes stock-based comp). GAAP diluted EPS was $3.56 (still a
//      beat vs $3.44 Finnhub est). No revenue or gross-margin consensus published
//      as adjusted vs GAAP basis differs slightly; gross-margin est: null.
//   5. Arithmetic verified: Q1 26: 1,639 + 204 = 1,843 ≈ 1,842 ✓ (rounding);
//      1,440 + 199 = 1,639 ✓; 1,206 + 234 = 1,440 ✓; 94 + 61 + 44 = 199 ✓.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // Single-segment business: all revenue is from the Software Platform after
  // the Apps divestiture (closed early 2025). Col 0 holds one node to preserve
  // the canonical 5-column Sankey shape.
  const NODES = [
    { id: "platform",     label: "Software Platform", value: 1842, prev_q: 1658, prev_y: 1159, col: 0, color: "#3b82f6" },
    { id: "total_rev",    label: "Total Revenue",     value: 1842, prev_q: 1658, prev_y: 1159, col: 1, color: "#2563a8" },
    { id: "gross_profit", label: "Gross Profit",      value: 1639, prev_q: 1474, prev_y: 1007, col: 2, color: "#16a34a" },
    { id: "cost_rev",     label: "Cost of Revenue",   value: 204,  prev_q: 184,  prev_y: 152,  col: 2, color: "#dc2626" },
    { id: "op_income",    label: "Op. Income",        value: 1440, prev_q: 1275, prev_y: 840,  col: 3, color: "#15803d" },
    { id: "op_expenses",  label: "Op. Expenses",      value: 199,  prev_q: 199,  prev_y: 167,  col: 3, color: "#b91c1c" },
    { id: "net_income",   label: "Net Income",        value: 1206, prev_q: 1102, prev_y: 724,  col: 4, color: "#166534" },
    { id: "tax_other",    label: "Tax & Other",       value: 234,  prev_q: 173,  prev_y: 116,  col: 4, color: "#991b1b" },
    { id: "rd",           label: "R&D",               value: 94,   prev_q: 82,   prev_y: 56,   col: 4, color: "#b91c1c" },
    { id: "sales_mktg",   label: "Sales & Mktg",      value: 61,   prev_q: 49,   prev_y: 59,   col: 4, color: "#b91c1c" },
    { id: "ga",           label: "G&A",               value: 44,   prev_q: 68,   prev_y: 52,   col: 4, color: "#b91c1c" },
  ];

  const LINKS = [
    { s: "platform",     t: "total_rev",    v: 1842 },
    { s: "total_rev",    t: "gross_profit", v: 1639 },
    { s: "total_rev",    t: "cost_rev",     v: 204 },
    { s: "gross_profit", t: "op_income",    v: 1440 },
    { s: "gross_profit", t: "op_expenses",  v: 199 },
    { s: "op_income",    t: "net_income",   v: 1206 },
    { s: "op_income",    t: "tax_other",    v: 234 },
    { s: "op_expenses",  t: "rd",           v: 94 },
    { s: "op_expenses",  t: "sales_mktg",   v: 61 },
    { s: "op_expenses",  t: "ga",           v: 44 },
  ];

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // KPI: Adj. EPS is the Street consensus basis for APP (non-GAAP, excludes SBC).
  // Revenue & EPS estimates from wire aggregate (IndexBox / press recap), searched
  // 2026-05-22. Gross-margin consensus not consistently published; est: null.
  const KPI = [
    { label: "Revenue",      actual: "$1.84B", est: "$1.77B", beat: true },
    { label: "Gross Margin", actual: "89.0%",  est: null,     beat: null },
    { label: "Adj. EPS",     actual: "$3.76",  est: "$3.64",  beat: true },
  ];
  const GUIDANCE = { value: "$1.92–1.95B", note: "Q2 Rev. · Adj. EBITDA $1.62–1.64B (~84% mgn)" };

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => v >= 1000 ? `$${(v / 1000).toFixed(2)}B` : `$${v}M`;
  const pct    = (v, r) => r ? ((v - r) / Math.abs(r)) * 100 : null;
  const fmtPct = p => p === null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  const pctClr = p => p === null ? "#94a3b8" : p >= 0 ? "#16a34a" : "#dc2626";
  const esc    = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">

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
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q2 2026 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: AppLovin Q1 2026 Earnings · investors.applovin.com</text>

      ${paths.map(p => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="0.6"/>`).join('')}

      ${NODES.map(n => { const nd = nMap[n.id]; return nd ? `<rect x="${nd.x}" y="${nd.y}" width="${NODE_W}" height="${nd.h}" rx="3" fill="${n.color}" opacity="0.93"/>` : ''; }).join('')}

      ${lbls.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}" font-family="system-ui,sans-serif">${esc(l.text)}</text>`).join('')}
    </svg>`;

    return svg;
  }

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
      a.download = 'app_q1_2026.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_APP = downloadPNG;

  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_APP()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;
})();
