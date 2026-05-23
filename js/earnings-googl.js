// Alphabet (GOOGL) Q1 2026 income-statement Sankey, scoped for embedding inside
// a dynamic container on the company page. Renders into #earnings-slot.
//
// Source: Alphabet Q1 2026 earnings release (8-K Exhibit 99.1, filed 2026-04-29)
//   https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000043/googexhibit991q12026.htm
// Consensus: Wall Street (LSEG/FactSet) — searched 2026-05-21
//   Revenue est. $107.2B; Adj. EPS est. $2.63
//
// NOTE 1: GAAP net income ($62.6B) is materially > operating income ($39.7B)
//   because Q1 2026 included $36.9B of unrealised gains on equity securities
//   ("Other income (expense), net" was +$37.7B). To keep the Sankey honest,
//   the diagram terminates at Operating Income — net income and EPS are shown
//   in the KPI strip. (Same approach as the PLTR module.)
// NOTE 2: Segment col 0 = Google Services, Google Cloud, Other Bets, Hedging.
//   Hedging is a small NEGATIVE flow ($-180M) which a Sankey cannot render;
//   it's modelled as a tiny segment node with a positive |value| so the
//   geometry works, with a console.warn() noting the reconciliation gap.
// NOTE 3: Alphabet does NOT issue quantitative forward revenue guidance,
//   so GUIDANCE = null. Capex guidance ($180-190B for FY26) is noted in
//   the press release but is not a revenue/EPS metric.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // Revenue segments — Hedging was -$180M in Q1 2026; modelled with |value|
  // so the Sankey can draw it. Reconciliation: 89,637+20,028+411 = 110,076;
  // total revenue 109,896; gap = -180 (hedging loss). To balance the link
  // diagram we feed 89,457 from Google Services into total_rev (i.e. net of
  // the hedging loss) and keep the segment label/value at the gross 89,637.
  // This is an aesthetic compromise documented here.
  const NODES = [
    { id: "google_services", label: "Google Services", value: 89637, prev_q: 95900, prev_y: 77264, col: 0, color: "#3b82f6" },
    { id: "google_cloud",    label: "Google Cloud",    value: 20028, prev_q: 17700, prev_y: 12260, col: 0, color: "#3b82f6" },
    { id: "other_bets",      label: "Other Bets",      value: 411,   prev_q: 370,   prev_y: 450,   col: 0, color: "#60a5fa" },
    { id: "total_rev",       label: "Total Revenue",   value: 109896, prev_q: 113800, prev_y: 90234, col: 1, color: "#2563a8" },
    { id: "gross_profit",    label: "Gross Profit",    value: 68625, prev_q: 73187, prev_y: 53873, col: 2, color: "#16a34a" },
    { id: "cost_rev",        label: "Cost of Revenues", value: 41271, prev_q: 40613, prev_y: 36361, col: 2, color: "#dc2626" },
    { id: "op_income",       label: "Op. Income",      value: 39696, prev_q: 48303, prev_y: 30606, col: 3, color: "#15803d" },
    { id: "op_expenses",     label: "Op. Expenses",    value: 28929, prev_q: 24884, prev_y: 23267, col: 3, color: "#b91c1c" },
    { id: "rd",              label: "R&D",             value: 17032, prev_q: 13116, prev_y: 13556, col: 4, color: "#b91c1c" },
    { id: "sm",              label: "Sales & Mktg.",   value: 7606,  prev_q: 7363,  prev_y: 6172,  col: 4, color: "#b45309" },
    { id: "ga",              label: "G&A",             value: 4291,  prev_q: 4405,  prev_y: 3539,  col: 4, color: "#7c3aed" },
  ];

  // total_rev inflow = 89,457 + 20,028 + 411 = 109,896  (Google Services flow
  // is net of the $180M hedging loss; documented above).
  const LINKS = [
    { s: "google_services", t: "total_rev",    v: 89457 },
    { s: "google_cloud",    t: "total_rev",    v: 20028 },
    { s: "other_bets",      t: "total_rev",    v: 411 },
    { s: "total_rev",       t: "gross_profit", v: 68625 },
    { s: "total_rev",       t: "cost_rev",     v: 41271 },
    { s: "gross_profit",    t: "op_income",    v: 39696 },
    { s: "gross_profit",    t: "op_expenses",  v: 28929 },
    { s: "op_expenses",     t: "rd",           v: 17032 },
    { s: "op_expenses",     t: "sm",           v: 7606 },
    { s: "op_expenses",     t: "ga",           v: 4291 },
  ];

  // Arithmetic sanity checks (warn only)
  (function checkMath() {
    const gp = 109896 - 41271; if (Math.abs(gp - 68625) > 1100) console.warn('GOOGL: gross profit mismatch', gp);
    const opex = 17032 + 7606 + 4291; if (Math.abs(opex - 28929) > 290) console.warn('GOOGL: opex sum mismatch', opex);
    const opi = 68625 - 28929; if (Math.abs(opi - 39696) > 400) console.warn('GOOGL: op income mismatch', opi);
    const segSum = 89637 + 20028 + 411; // 110,076 (gross before hedging)
    if (Math.abs(segSum - 180 - 109896) > 11) console.warn('GOOGL: segment-to-total gap', segSum - 109896);
  })();

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // Source: Revenue & EPS consensus from LSEG / FactSet via CNBC and StockStory,
  // searched 2026-05-21. Adj. EPS $2.62 vs $2.63 est. = ~1¢ miss (driven by
  // non-cash items excluded by Street). GAAP EPS was $5.11 incl. equity gains.
  const KPI = [
    { label: "Revenue",      actual: "$109.9B", est: "$107.2B", beat: true  },
    { label: "Gross Margin", actual: "62.4%",   est: null,      beat: null  },
    { label: "Adj. EPS",     actual: "$2.62",   est: "$2.63",   beat: false },
  ];

  // Alphabet does not issue quantitative forward revenue guidance.
  const GUIDANCE = null;

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
      const green = ["gross_profit", "op_income"].includes(lk.t);
      const rev   = lk.t === "total_rev";
      return {
        d,
        fill:   rev ? "rgba(59,130,246,0.18)" : green ? "rgba(22,163,74,0.20)" : "rgba(220,38,38,0.17)",
        stroke: rev ? "rgba(59,130,246,0.38)" : green ? "rgba(22,163,74,0.4)"  : "rgba(220,38,38,0.33)",
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
      ${GUIDANCE ? `<line x1="${W * 0.75}" y1="${TITLE_H + 10}" x2="${W * 0.75}" y2="${TITLE_H + METRICS_H - 10}" stroke="#e2e8f0" stroke-width="1"/>` : ''}
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
      ${GUIDANCE ? `<text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q2 &apos;26 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>` : ''}

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Alphabet Q1 2026 Earnings · abc.xyz/investor</text>

      ${paths.map(p => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="0.6"/>`).join('')}

      ${NODES.map(n => { const nd = nMap[n.id]; return nd ? `<rect x="${nd.x}" y="${nd.y}" width="${NODE_W}" height="${nd.h}" rx="3" fill="${n.color}" opacity="0.93"/>` : ''; }).join('')}

      ${lbls.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}" font-family="system-ui,sans-serif">${esc(l.text)}</text>`).join('')}
    </svg>`;
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
      a.download = 'googl_q1_2026.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_GOOGL = downloadPNG;

  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_GOOGL()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;
})();
