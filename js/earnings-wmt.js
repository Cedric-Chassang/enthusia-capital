// Walmart Q1 FY27 income-statement Sankey, scoped for embedding inside a
// dynamic container on the company page. Renders into #earnings-slot.
//
// Source filing: Walmart Q1 FY27 8-K (press release), period ending April 30, 2026,
//   https://www.sec.gov/Archives/edgar/data/0000104169/000010416926000095/earningsreleasefy27q1.htm
//   Earnings presentation: earningspresentationfy27.htm
// Prior-quarter (Q4 FY26) consolidated lines derived from XBRL Companyfacts
//   (FY26 10-K minus 9M FY26 from Q3 10-Q):
//   https://data.sec.gov/api/xbrl/companyfacts/CIK0000104169.json
// Consensus sources: Finnhub /stock/earnings (Adj. EPS est $0.6638) and web aggregate
//   (Revenue est $174.8B — actual beat by $2.97B per release wires, searched 2026-05-22).
//
// CAVEATS:
//   1. Walmart's segment "Net sales" excludes Membership and other income. The col-0
//      "Membership & Other" node ($2,051M Q1 FY27, $1,509M Q1 FY26) is the residual
//      (Total Revenue − sum of three segment net sales), reflecting how WMT reports
//      membership/advertising/other at the consolidated level rather than within a
//      named segment. Prev_q is null because Q4 FY26 segment-level XBRL was not
//      extracted in this run (would require 10-Q instance doc parsing, not just
//      Companyfacts which only holds consolidated tags).
//   2. Q4 FY26 consolidated values derived by FY26 10-K − 9MFY26 10-Q arithmetic:
//        Revenue 713,163 − 522,507 = 190,656M
//        COGS    535,395 − 391,780 = 143,615M
//        OpInc    29,825 − 21,117 =   8,708M
//        SG&A    147,943 − 109,610 = 38,333M
//        NetInc consolidated 21,893 − 17,656 = 4,237M; Walmart-attributable is approximate
//        because quarterly NCI not separable from Companyfacts.
//   3. WMT does not separately disclose R&D (retailer; no R&D line). Op. Expenses
//      column 3 has no col-4 children — only Op. Income splits to Net Income +
//      Tax/Other/NCI residual. Tax/Other = 7,493 − 5,330 = 2,163M (interest net 620 +
//      tax 1,658 + NCI 160 − other gains 275).
//   4. KPI uses Adjusted EPS ($0.66) — the standard Street consensus basis for WMT.
//      Consensus was $0.6638 → reported figure rounds to inline but technically a
//      $0.005 miss. Gross-margin consensus omitted (no clean wire); est: null.
//   5. Arithmetic verified: 117,200 + 35,100 + 23,400 + 2,051 = 177,751 ✓;
//      44,693 + 133,058 = 177,751 ✓; 7,493 + 37,200 = 44,693 ✓;
//      5,330 + 2,163 = 7,493 ✓.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // Q1 FY27 segment net sales from Walmart's press release segment tables.
  // Membership & Other = Total Revenue − Σ(segment net sales), reflecting how WMT
  // reports membership/advertising/other at the consolidated level.
  const NODES = [
    { id: "walmart_us",   label: "Walmart U.S.",        value: 117200, prev_q: null,   prev_y: 112200, col: 0, color: "#3b82f6" },
    { id: "intl",         label: "Walmart Intl",        value: 35100,  prev_q: null,   prev_y: 29800,  col: 0, color: "#3b82f6" },
    { id: "sams",         label: "Sam's Club",          value: 23400,  prev_q: null,   prev_y: 22100,  col: 0, color: "#3b82f6" },
    { id: "membership",   label: "Membership & Other",  value: 2051,   prev_q: null,   prev_y: 1509,   col: 0, color: "#60a5fa" },
    { id: "total_rev",    label: "Total Revenue",       value: 177751, prev_q: 190656, prev_y: 165609, col: 1, color: "#2563a8" },
    { id: "gross_profit", label: "Gross Profit",        value: 44693,  prev_q: 47041,  prev_y: 41306,  col: 2, color: "#16a34a" },
    { id: "cost_rev",     label: "Cost of Sales",       value: 133058, prev_q: 143615, prev_y: 124303, col: 2, color: "#dc2626" },
    { id: "op_income",    label: "Op. Income",          value: 7493,   prev_q: 8708,   prev_y: 7135,   col: 3, color: "#15803d" },
    { id: "op_expenses",  label: "SG&A",                value: 37200,  prev_q: 38333,  prev_y: 34171,  col: 3, color: "#b91c1c" },
    { id: "net_income",   label: "Net Income",          value: 5330,   prev_q: null,   prev_y: 4487,   col: 4, color: "#166534" },
    { id: "tax_other",    label: "Tax / Interest / NCI",value: 2163,   prev_q: null,   prev_y: 2648,   col: 4, color: "#991b1b" },
  ];

  const LINKS = [
    { s: "walmart_us",   t: "total_rev",    v: 117200 },
    { s: "intl",         t: "total_rev",    v: 35100 },
    { s: "sams",         t: "total_rev",    v: 23400 },
    { s: "membership",   t: "total_rev",    v: 2051 },
    { s: "total_rev",    t: "gross_profit", v: 44693 },
    { s: "total_rev",    t: "cost_rev",     v: 133058 },
    { s: "gross_profit", t: "op_income",    v: 7493 },
    { s: "gross_profit", t: "op_expenses",  v: 37200 },
    { s: "op_income",    t: "net_income",   v: 5330 },
    { s: "op_income",    t: "tax_other",    v: 2163 },
  ];

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // KPI uses Adj. EPS (Street consensus basis). Revenue beat est $174.8B by $3.0B.
  // EPS rounds to inline ($0.66 reported vs $0.6638 consensus). Gross-margin
  // consensus not found on the wires; est: null. — Finnhub /stock/earnings + press
  // release wire aggregate, searched 2026-05-22.
  const KPI = [
    { label: "Revenue",      actual: "$177.8B", est: "$174.8B", beat: true },
    { label: "Gross Margin", actual: "25.1%",   est: null,      beat: null },
    { label: "Adj. EPS",     actual: "$0.66",   est: "$0.66",   beat: false },
  ];
  const GUIDANCE = { value: "$0.72–0.74", note: "Q2 Adj. EPS · NS +4–5% cc · OI +7–10% cc" };

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`;
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

      <text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">Q1 FY27 Income Statement</text>
      <text x="${W / 2}" y="38" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">Period ending April 30, 2026 · Unaudited · $ in millions</text>

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
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q2 FY27 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Walmart Q1 FY27 Earnings · corporate.walmart.com</text>

      ${paths.map(p => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="0.6"/>`).join('')}

      ${NODES.map(n => { const nd = nMap[n.id]; return nd ? `<rect x="${nd.x}" y="${nd.y}" width="${NODE_W}" height="${nd.h}" rx="3" fill="${n.color}" opacity="0.93"/>` : ''; }).join('')}

      ${lbls.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}" font-family="system-ui,sans-serif">${esc(l.text)}</text>`).join('')}
    </svg>`;

    return svg;
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
      a.download = 'wmt_q1_fy27.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_WMT = downloadPNG;

  // ─── Inject ───────────────────────────────────────────────────────────────
  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_WMT()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;
})();
