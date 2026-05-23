// Microsoft Q3 FY26 income-statement Sankey, scoped for embedding inside a
// dynamic container on the company page. Renders into #earnings-slot.
//
// Source filing: Microsoft Corporation Form 8-K (earnings press release),
//   three months ended March 31, 2026, filed April 29, 2026
//   https://www.sec.gov/Archives/edgar/data/0000789019/000119312526191457/msft-ex99_1.htm
//   10-Q: https://www.sec.gov/Archives/edgar/data/0000789019/000119312526191507/msft-20260331.htm
// Consensus (EPS / Revenue): Bloomberg & StreetAccount via CNBC and Yahoo Finance
//   recaps — searched 2026-05-21. EPS est. $4.06, Revenue est. $81.46B.
// Gross-margin consensus: ~68% (Visible Alpha / StreetAccount commentary).
// Q4 FY26 revenue guidance: $86.7B–$87.8B from Microsoft CFO commentary
//   (FY26 Q3 earnings call, April 29, 2026). Q4 consensus pre-guide was ~$85.6B.
//
// Caveats:
// - Prior-quarter (Q2 FY26) GAAP net income of $38.5B was inflated by a
//   non-recurring tax benefit; non-GAAP NI was $30.9B. We display GAAP NI
//   for the QoQ delta to stay consistent with reported figures. The prev_q
//   value appears only in QoQ labels — it is NOT used in any Sankey flow,
//   so this does not affect arithmetic integrity of the chart.
// - "Tax & Other" terminal node = Operating Income − Net Income (i.e. it
//   nets other income/expense and tax provision into a single residual to
//   keep the Sankey balanced at the operating-income node).
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // Values in $ millions. Segments per Microsoft's reportable segment disclosure.
  // Tax & Other terminal = Operating Income − Net Income (residual).
  const NODES = [
    { id: "pbp",          label: "Productivity & Bus. Proc.", value: 35011, prev_q: 34100, prev_y: 29941, col: 0, color: "#3b82f6" },
    { id: "ic",           label: "Intelligent Cloud",          value: 34650, prev_q: 32900, prev_y: 26751, col: 0, color: "#3b82f6" },
    { id: "mpc",          label: "More Personal Computing",    value: 13225, prev_q: 14300, prev_y: 13374, col: 0, color: "#3b82f6" },
    { id: "total_rev",    label: "Total Revenue",              value: 82886, prev_q: 81300, prev_y: 70066, col: 1, color: "#2563a8" },
    { id: "gross_profit", label: "Gross Profit",               value: 56058, prev_q: 55000, prev_y: 48176, col: 2, color: "#16a34a" },
    { id: "cost_rev",     label: "Cost of Revenue",            value: 26828, prev_q: 26300, prev_y: 21890, col: 2, color: "#dc2626" },
    { id: "op_income",    label: "Op. Income",                 value: 38398, prev_q: 38300, prev_y: 32000, col: 3, color: "#15803d" },
    { id: "op_expenses",  label: "Op. Expenses",               value: 17660, prev_q: 17020, prev_y: 16142, col: 3, color: "#b91c1c" },
    { id: "net_income",   label: "Net Income",                 value: 31800, prev_q: 38500, prev_y: 25824, col: 4, color: "#166534" },
    { id: "tax_other",    label: "Tax & Other",                value: 6598,  prev_q: -200,  prev_y: 6176,  col: 4, color: "#991b1b" },
    { id: "rd",           label: "R&D",                        value: 8915,  prev_q: 8504,  prev_y: 8221,  col: 4, color: "#b91c1c" },
    { id: "sm",           label: "Sales & Marketing",          value: 6814,  prev_q: 6584,  prev_y: 6196,  col: 4, color: "#b91c1c" },
    { id: "ga",           label: "G&A",                        value: 1931,  prev_q: 1932,  prev_y: 1725,  col: 4, color: "#b45309" },
  ];

  const LINKS = [
    { s: "pbp",          t: "total_rev",    v: 35011 },
    { s: "ic",           t: "total_rev",    v: 34650 },
    { s: "mpc",          t: "total_rev",    v: 13225 },
    { s: "total_rev",    t: "gross_profit", v: 56058 },
    { s: "total_rev",    t: "cost_rev",     v: 26828 },
    { s: "gross_profit", t: "op_income",    v: 38398 },
    { s: "gross_profit", t: "op_expenses",  v: 17660 },
    { s: "op_income",    t: "net_income",   v: 31800 },
    { s: "op_income",    t: "tax_other",    v: 6598 },
    { s: "op_expenses",  t: "rd",           v: 8915 },
    { s: "op_expenses",  t: "sm",           v: 6814 },
    { s: "op_expenses",  t: "ga",           v: 1931 },
  ];

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // Consensus: EPS via Bloomberg consensus $4.06 (CNBC recap, Apr 29 2026);
  // Revenue via StreetAccount $81.46B; Gross-margin Street ~68.0%.
  // Searched 2026-05-21.
  const KPI = [
    { label: "Revenue",      actual: "$82.9B", est: "$81.5B", beat: true },
    { label: "Gross Margin", actual: "67.6%",  est: "68.0%",  beat: false },
    { label: "EPS (GAAP)",   actual: "$4.27",  est: "$4.06",  beat: true },
  ];
  const GUIDANCE = { value: "$86.7–87.8B", note: "Q4 Rev. consensus $85.6B (LSEG)" };

  // Arithmetic sanity check — log if any node imbalance > 1%
  (function verify() {
    const sumSeg = 35011 + 34650 + 13225;
    if (Math.abs(sumSeg - 82886) / 82886 > 0.01) console.warn('MSFT segments do not sum to total revenue', sumSeg);
    if (Math.abs((56058 + 26828) - 82886) / 82886 > 0.01) console.warn('MSFT GP+CoR != revenue');
    if (Math.abs((38398 + 17660) - 56058) / 56058 > 0.01) console.warn('MSFT OpInc+OpEx != GP');
    if (Math.abs((8915 + 6814 + 1931) - 17660) / 17660 > 0.01) console.warn('MSFT R&D+S&M+G&A != OpEx');
    if (Math.abs((31800 + 6598) - 38398) / 38398 > 0.01) console.warn('MSFT NI+Tax&Other != OpInc');
  })();

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`;
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

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">

      <rect x="0" y="0" width="${W}" height="${TITLE_H}" fill="#f8fafc"/>
      <line x1="0" y1="${TITLE_H}" x2="${W}" y2="${TITLE_H}" stroke="#e2e8f0" stroke-width="1"/>

      <text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">Q3 FY26 Income Statement</text>
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
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q4 &apos;26 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Microsoft Q3 FY26 Earnings · microsoft.com/investor</text>

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
      a.download = 'msft_q3_fy26.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_MSFT = downloadPNG;

  // ─── Inject ───────────────────────────────────────────────────────────────
  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_MSFT()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;
})();
