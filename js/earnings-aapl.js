// Apple Q2 FY2026 income-statement Sankey, scoped for embedding inside a
// dynamic container on the company page. Renders into #earnings-slot.
//
// Source filing: Apple Inc. Form 8-K (Q2 FY26 press release) and Form 10-Q
//   - Press release: https://www.apple.com/newsroom/2026/04/apple-reports-second-quarter-results/
//   - 8-K exhibit:    https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000011/a8-kex991q2202603282026.htm
//   - 10-Q:           https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000013/aapl-20260328.htm
//   - Period ending:  March 28, 2026 (reported April 30, 2026)
//
// Consensus sources:
//   - EPS / Revenue consensus: LSEG (formerly Refinitiv) — pre-print survey of ~31-32 sell-side analysts
//   - Cross-check: Finnhub /stock/earnings endpoint (AAPL)
//   - Searched: 2026-05-21
//
// Caveats:
//   - prev_q (Q1 FY26) segment-level revenue is taken from Apple's Q1 FY26 8-K
//     press release. The Mac / iPad / Wearables Q1 prev_q values are rounded
//     to the figures Apple disclosed in the segment table; cost-of-sales and
//     opex prev_q values are derived from Q1 FY26 reported consolidated lines.
//   - Apple reports "Cost of Sales" (not "Cost of Revenue"); label preserved.
//   - Apple does NOT separately disclose SG&A from R&D outside these two
//     line items. Operating expenses on col 4 are split into R&D and SG&A only.
//   - "Tax & Other" combines provision for income taxes ($6,255M) with
//     other income/(expense) net (~$46M expense) to make the Op-Income →
//     Net-Income flow balance to the penny.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // All values in $ millions.
  // Q2 FY26 actuals: 8-K + 10-Q (period ended March 28, 2026)
  // Q1 FY26 prev_q : 8-K Q1 FY26 (period ended December 27, 2025)
  // Q2 FY25 prev_y : 8-K Q2 FY25 (period ended March 29, 2025)
  const NODES = [
    { id: "iphone",       label: "iPhone",                       value: 56990,  prev_q: 85300, prev_y: 46840, col: 0, color: "#3b82f6" },
    { id: "services",     label: "Services",                     value: 30980,  prev_q: 30000, prev_y: 26650, col: 0, color: "#3b82f6" },
    { id: "mac",          label: "Mac",                          value: 8400,   prev_q: 9200,  prev_y: 7950,  col: 0, color: "#60a5fa" },
    { id: "wearables",    label: "Wearables, Home & Acc.",       value: 7900,   prev_q: 11100, prev_y: 7520,  col: 0, color: "#60a5fa" },
    { id: "ipad",         label: "iPad",                         value: 6910,   prev_q: 8200,  prev_y: 6400,  col: 0, color: "#60a5fa" },
    { id: "total_rev",    label: "Total Net Sales",              value: 111180, prev_q: 143800,prev_y: 95360, col: 1, color: "#2563a8" },
    { id: "gross_profit", label: "Gross Profit",                 value: 54777,  prev_q: 68300, prev_y: 44867, col: 2, color: "#16a34a" },
    { id: "cost_rev",     label: "Cost of Sales",                value: 56403,  prev_q: 75500, prev_y: 50493, col: 2, color: "#dc2626" },
    { id: "op_income",    label: "Op. Income",                   value: 35881,  prev_q: 50800, prev_y: 27890, col: 3, color: "#15803d" },
    { id: "op_expenses",  label: "Op. Expenses",                 value: 18896,  prev_q: 17500, prev_y: 16977, col: 3, color: "#b91c1c" },
    { id: "net_income",   label: "Net Income",                   value: 29580,  prev_q: 42100, prev_y: 24780, col: 4, color: "#166534" },
    { id: "tax_other",    label: "Tax & Other",                  value: 6301,   prev_q: 8700,  prev_y: 3110,  col: 4, color: "#991b1b" },
    { id: "rd",           label: "R&D",                          value: 11419,  prev_q: 10510, prev_y: 8550,  col: 4, color: "#b91c1c" },
    { id: "sga",          label: "SG&A",                         value: 7477,   prev_q: 6990,  prev_y: 6728,  col: 4, color: "#b91c1c" },
  ];

  const LINKS = [
    { s: "iphone",       t: "total_rev",    v: 56990 },
    { s: "services",     t: "total_rev",    v: 30980 },
    { s: "mac",          t: "total_rev",    v: 8400 },
    { s: "wearables",    t: "total_rev",    v: 7900 },
    { s: "ipad",         t: "total_rev",    v: 6910 },
    { s: "total_rev",    t: "gross_profit", v: 54777 },
    { s: "total_rev",    t: "cost_rev",     v: 56403 },
    { s: "gross_profit", t: "op_income",    v: 35881 },
    { s: "gross_profit", t: "op_expenses",  v: 18896 },
    { s: "op_income",    t: "net_income",   v: 29580 },
    { s: "op_income",    t: "tax_other",    v: 6301 },
    { s: "op_expenses",  t: "rd",           v: 11419 },
    { s: "op_expenses",  t: "sga",          v: 7477 },
  ];

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // KPI consensus: LSEG (~31-32 analyst survey) — searched 2026-05-21.
  // Revenue actual $111.18B vs $109.7B; GM 49.3% vs ~47.5% (Street); EPS $2.01 vs $1.95.
  const KPI = [
    { label: "Revenue",      actual: "$111.2B", est: "$109.7B", beat: true },
    { label: "Gross Margin", actual: "49.3%",   est: "47.5%",   beat: true },
    { label: "EPS (GAAP)",   actual: "$2.01",   est: "$1.95",   beat: true },
  ];
  // Q3 FY26 guidance: 14-17% YoY revenue growth implies ~$107-110B (on Q3 FY25 base ~$94B).
  // Street consensus going in was ~$103B (9.5% growth). Source: earnings call commentary.
  const GUIDANCE = { value: "+14-17% YoY", note: "Q3 Rev. consensus $103B (LSEG)" };

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`;
  const pct    = (v, r) => r ? ((v - r) / Math.abs(r)) * 100 : null;
  const fmtPct = p => p === null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  const pctClr = p => p === null ? "#94a3b8" : p >= 0 ? "#16a34a" : "#dc2626";
  const esc    = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ─── Arithmetic sanity checks (±1%) ───────────────────────────────────────
  (function verify() {
    const segSum = 56990 + 30980 + 8400 + 7900 + 6910;
    if (Math.abs(segSum - 111180) / 111180 > 0.01) console.warn('AAPL: segment sum mismatch', segSum);
    if (Math.abs((54777 + 56403) - 111180) / 111180 > 0.01) console.warn('AAPL: GP+COS != Rev');
    if (Math.abs((35881 + 18896) - 54777) / 54777 > 0.01) console.warn('AAPL: OpInc+OpEx != GP');
    if (Math.abs((29580 + 6301) - 35881) / 35881 > 0.01) console.warn('AAPL: NI+Tax != OpInc');
    if (Math.abs((11419 + 7477) - 18896) / 18896 > 0.01) console.warn('AAPL: R&D+SGA != OpEx');
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

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">

      <rect x="0" y="0" width="${W}" height="${TITLE_H}" fill="#f8fafc"/>
      <line x1="0" y1="${TITLE_H}" x2="${W}" y2="${TITLE_H}" stroke="#e2e8f0" stroke-width="1"/>

      <text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">Q2 FY26 Income Statement</text>
      <text x="${W / 2}" y="38" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">Period ending March 28, 2026 · Unaudited · $ in millions</text>

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
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q3 &apos;26 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Apple Q2 FY26 Earnings · investor.apple.com</text>

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
      a.download = 'aapl_q2_fy26.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_AAPL = downloadPNG;

  // ─── Inject ───────────────────────────────────────────────────────────────
  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_AAPL()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;

  // Expose data for the localhost copy-paste-to-X share panel on company.html.
  window.__enthusiaEarnings = window.__enthusiaEarnings || {};
  window.__enthusiaEarnings['AAPL'] = { ticker: 'AAPL', period: 'Q2 FY2026', KPI, GUIDANCE, download: downloadPNG };
  window.dispatchEvent(new CustomEvent('enthusia-earnings-ready', { detail: { ticker: 'AAPL' } }));
})();
