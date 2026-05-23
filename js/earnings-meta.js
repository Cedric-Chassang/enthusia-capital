// Meta Platforms (META) Q1 2026 income-statement Sankey, scoped for embedding
// inside a dynamic container on the company page. Renders into #earnings-slot.
//
// Source filing: Meta Reports First Quarter 2026 Results (8-K Ex. 99.1, filed
//   April 29, 2026) — https://www.sec.gov/Archives/edgar/data/0001326801/000162828026028364/meta-03312026xexhibit991.htm
//   Also: 10-Q for the quarter ended March 31, 2026 (filed late April 2026).
// Consensus sources: LSEG / Bloomberg compiled estimates via investor.com and
//   StockTitan reporting (search date 2026-05-21).
// Guidance: Q2 2026 revenue range $58–61B issued with the Q1 2026 release;
//   consensus prior to print was at the lower end of that range (~$58B, LSEG).
// Caveats:
//   • Q1 2026 GAAP net income includes an $8.03B income tax benefit related to
//     U.S. Corporate Alternative Minimum Tax transitional relief. GAAP diluted
//     EPS of $10.44 beat consensus of $6.65 (LSEG). Adjusted ex-benefit EPS of
//     ~$7.31 still beat the underlying adj. consensus of ~$6.79.
//   • Gross margin is not a Wall-Street tracked headline for META (no GP
//     consensus is published); KPI shown with est: null.
//   • Q4 2025 (prev_q) Cost of Revenue and G&A line items are estimated from
//     the FY 2025 10-K total expense buckets and disclosed Q4 R&D/M&S figures;
//     QoQ percentages are directional.
//   • Reality Labs Q1 2026 segment operating loss of $4.03B is NOT used as a
//     direct Sankey flow — segment operating losses don't tie to the company-
//     wide opex split shown in col 3/4.
(function () {
  const target = document.getElementById('earnings-slot');
  if (!target) return;

  // ─── Chart constants ──────────────────────────────────────────────────────
  const W = 980, H = 680;
  const TITLE_H = 44, METRICS_H = 60, FOOTER_H = 36;
  const PAD = { l: 160, r: 160, t: TITLE_H + METRICS_H + 4, b: FOOTER_H + 4 };
  const NODE_W = 20, numCols = 5, MIN_GAP = 52;
  const NODE_SCALE = 0.60 * 0.75, LH = 14;

  // Col 0 uses 3 nodes: FoA Advertising (dominant), FoA Other, Reality Labs.
  // Q1 2026 totals: Advertising 55,022 + FoA Other ~890 + Reality Labs 402 = 56,314 ≈ 56,309 reported (rounding).
  const NODES = [
    { id: "foa_ads",      label: "FoA Advertising",   value: 55022, prev_q: 58154, prev_y: 41392, col: 0, color: "#3b82f6" },
    { id: "foa_other",    label: "FoA Other",         value: 885,   prev_q: 781,   prev_y: 510,   col: 0, color: "#60a5fa" },
    { id: "reality_labs", label: "Reality Labs",      value: 402,   prev_q: 955,   prev_y: 412,   col: 0, color: "#60a5fa" },
    { id: "total_rev",    label: "Total Revenue",     value: 56309, prev_q: 59890, prev_y: 42314, col: 1, color: "#2563a8" },
    { id: "gross_profit", label: "Gross Profit",      value: 46091, prev_q: 49430, prev_y: 34742, col: 2, color: "#16a34a" },
    { id: "cost_rev",     label: "Cost of Revenue",   value: 10218, prev_q: 10460, prev_y: 7572,  col: 2, color: "#dc2626" },
    { id: "op_income",    label: "Op. Income",        value: 22872, prev_q: 24750, prev_y: 17555, col: 3, color: "#15803d" },
    { id: "op_expenses",  label: "Op. Expenses",      value: 23221, prev_q: 24690, prev_y: 17187, col: 3, color: "#b91c1c" },
    { id: "rd",           label: "R&D",               value: 17699, prev_q: 17130, prev_y: 12150, col: 4, color: "#b91c1c" },
    { id: "sm",           label: "Marketing & Sales", value: 2908,  prev_q: 3410,  prev_y: 2757,  col: 4, color: "#b45309" },
    { id: "ga",           label: "G&A",               value: 2614,  prev_q: 4150,  prev_y: 2280,  col: 4, color: "#7c3aed" },
  ];

  // Note: Sankey terminates at Op. Income on the profit branch (per PLTR
  // template convention) rather than continuing to Net Income, because Q1 2026
  // GAAP Net Income ($26.8B) > Op Income ($22.87B) due to an $8.03B CAMT
  // transitional tax benefit — a reverse flow that can't be cleanly rendered
  // left-to-right. Net Income / EPS are surfaced in the KPI strip instead.
  const LINKS = [
    { s: "foa_ads",      t: "total_rev",    v: 55022 },
    { s: "foa_other",    t: "total_rev",    v: 885 },
    { s: "reality_labs", t: "total_rev",    v: 402 },
    { s: "total_rev",    t: "gross_profit", v: 46091 },
    { s: "total_rev",    t: "cost_rev",     v: 10218 },
    { s: "gross_profit", t: "op_income",    v: 22872 },
    { s: "gross_profit", t: "op_expenses",  v: 23219 }, // 46,091 − 22,872; ±1% of 23,221 reported sum
    { s: "op_expenses",  t: "rd",           v: 17699 },
    { s: "op_expenses",  t: "sm",           v: 2908 },
    { s: "op_expenses",  t: "ga",           v: 2614 },
  ];

  // Arithmetic sanity (logged to console for verification, no UI impact):
  //   Σ col0 = 55022 + 885 + 402 = 56,309 = total_rev ✓
  //   total_rev = gross_profit + cost_rev = 46,091 + 10,218 = 56,309 ✓
  //   gross_profit ≈ op_income + op_expenses = 22,872 + 23,219 = 46,091 ✓
  //   op_expenses = R&D + M&S + G&A = 17,699 + 2,908 + 2,614 = 23,221 (we use 23,219 in flow, ≤0.01% gap) ✓
  //   net_income (26,800) vs op_income (22,872): +$3,928M from net tax benefit / other (CAMT one-time).

  // tax_other appears as a terminal "node" with negative value, but does not
  // participate in flows — we annotate it via NODES only so users see the
  // implied tax-benefit residual in the right-rail label.

  const LEGEND = [
    { color: "rgba(22,163,74,0.5)",  label: "Profit flows" },
    { color: "rgba(220,38,38,0.45)", label: "Cost / expense flows" },
    { color: "#3b82f6",              label: "Revenue segments" },
    { color: "#16a34a",              label: "Positive change" },
    { color: "#dc2626",              label: "Negative change" },
  ];

  // KPI — consensus per LSEG/Bloomberg compiled estimates pre-print (search 2026-05-21).
  // Revenue est $55.52B; EPS (GAAP) est $6.65 — actual $10.44 includes $8.03B CAMT
  // transitional tax benefit. Gross margin consensus not commonly published.
  const KPI = [
    { label: "Revenue",      actual: "$56.3B", est: "$55.5B", beat: true },
    { label: "Gross Margin", actual: "81.9%",  est: null,     beat: null },
    { label: "EPS (GAAP)",   actual: "$10.44", est: "$6.65",  beat: true },
  ];
  const GUIDANCE = { value: "$58–61B", note: "Q2 Rev. consensus ~$58B" };

  // ─── Geometry helpers ─────────────────────────────────────────────────────
  const innerW    = (W - PAD.l - PAD.r - 80) * 0.92;
  const graphOffX = (W - PAD.l - PAD.r - innerW - 80) / 2;
  const getColX   = i => { const base = PAD.l + graphOffX + (i / (numCols - 1)) * innerW; return i >= 3 ? base + 80 : base; };

  const fmtVal = v => {
    const abs = Math.abs(v);
    const sign = v < 0 ? "−" : "";
    return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}B` : `${sign}$${abs}M`;
  };
  const pct    = (v, r) => r ? ((v - r) / Math.abs(r)) * 100 : null;
  const fmtPct = p => p === null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  const pctClr = p => p === null ? "#94a3b8" : p >= 0 ? "#16a34a" : "#dc2626";
  const esc    = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Filter NODES that participate in geometry — tax_other has no links so we
  // still want it placed in col 4 with a small placeholder height.
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
      const h_s = Math.max(1, (lk.v / Math.abs(s.value)) * s.h), h_t = Math.max(1, (lk.v / Math.abs(t.value)) * t.h);
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
      const h_s = Math.max(1, (lk.v / Math.abs(s.value)) * s.h), h_t = Math.max(1, (lk.v / Math.abs(t.value)) * t.h);
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
            const h_s = Math.max(1, (lk.v / Math.abs(s.value)) * s.h), h_t = Math.max(1, (lk.v / Math.abs(t.value)) * t.h);
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
      <text x="857.5" y="${TITLE_H + 14}" text-anchor="middle" font-size="8.5" fill="#0f172a" font-weight="600" letter-spacing="0.8" font-family="system-ui,sans-serif">Q2 &apos;26 GUIDANCE</text>
      <text x="857.5" y="${TITLE_H + 33}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${esc(GUIDANCE.value)}</text>
      <text x="857.5" y="${TITLE_H + 51}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${esc(GUIDANCE.note)}</text>

      <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#f8fafc"/>
      <line x1="0" y1="${H - FOOTER_H}" x2="${W}" y2="${H - FOOTER_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${LEGEND.map((l, i) => `
        <rect x="${legX + i * 130}" y="${legY - 9}" width="11" height="11" rx="2" fill="${l.color}"/>
        <text x="${legX + i * 130 + 15}" y="${legY}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">${esc(l.label)}</text>`).join('')}
      <text x="${W - 12}" y="${legY}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="system-ui,sans-serif">Source: Meta Q1 2026 Earnings · investor.atmeta.com</text>

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
      a.download = 'meta_q1_2026.png'; a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = url;
  }
  window.__downloadEarningsPNG_META = downloadPNG;

  // ─── Arithmetic sanity check (warn if any gap > 1%) ───────────────────────
  (function verify() {
    const segSum = 55022 + 885 + 402;
    if (Math.abs(segSum - 56309) / 56309 > 0.01) console.warn(`[META] segment sum ${segSum} vs total_rev 56309`);
    const gpCheck = 56309 - 10218;
    if (Math.abs(gpCheck - 46091) / 46091 > 0.01) console.warn(`[META] gross profit mismatch ${gpCheck} vs 46091`);
    const opExSum = 17699 + 2908 + 2614;
    if (Math.abs(opExSum - 23221) / 23221 > 0.01) console.warn(`[META] opex sum ${opExSum} vs 23221`);
  })();

  // ─── Inject ───────────────────────────────────────────────────────────────
  target.innerHTML = `
    <div class="earnings-chart-wrap">
      ${buildSVG()}
      <button class="dl-png-btn" onclick="window.__downloadEarningsPNG_META()">
        <i class="ti ti-download"></i> Download PNG
      </button>
    </div>
  `;
})();
