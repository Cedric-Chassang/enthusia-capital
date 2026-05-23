(function () {
  const tickers = [
    { symbol: 'S&P 500',  price: 6124.38,  change:  0.43 },
    { symbol: 'NASDAQ',   price: 20847.52, change:  0.67 },
    { symbol: 'DOW',      price: 44820.11, change:  0.21 },
    { symbol: 'AAPL',     price: 234.55,   change:  1.23 },
    { symbol: 'MSFT',     price: 478.82,   change:  0.87 },
    { symbol: 'NVDA',     price: 1245.34,  change:  2.14 },
    { symbol: 'GOOGL',    price: 198.92,   change: -0.34 },
    { symbol: 'META',     price: 712.18,   change:  1.45 },
    { symbol: 'AMZN',     price: 228.67,   change:  0.92 },
    { symbol: 'TSLA',     price: 318.73,   change: -1.87 },
    { symbol: 'ARAMCO',   price: 29.85,    change:  0.36 },
    { symbol: 'SABIC',    price: 94.20,    change: -0.22 },
    { symbol: 'QNB',      price: 18.74,    change:  0.58 },
    { symbol: 'GOLD',     price: 3284.60,  change:  0.28 },
    { symbol: 'WTI',      price: 72.43,    change: -0.54 },
    { symbol: 'BTC',      price: 94842.00, change:  1.92 },
    { symbol: 'ETH',      price: 4284.20,  change:  2.31 },
  ];

  function fmt(price) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildHTML() {
    return tickers.map(t => {
      const up   = t.change >= 0;
      const sign = up ? '+' : '';
      const cls  = up ? 'tick-up' : 'tick-down';
      const arrow = up ? '▲' : '▼';
      return `<span class="tick-item">` +
        `<span class="tick-symbol">${t.symbol}</span>` +
        `<span class="tick-price">${fmt(t.price)}</span>` +
        `<span class="tick-change ${cls}">${arrow}&nbsp;${sign}${t.change.toFixed(2)}%</span>` +
        `</span>`;
    }).join('<span class="tick-sep"></span>');
  }

  function render() {
    const track = document.getElementById('ticker-track');
    if (!track) return;

    const html = buildHTML();
    const gap  = '<span class="tick-gap"></span>';
    track.innerHTML = html + gap + html + gap;

    track.style.animation = 'none';
    track.offsetHeight;
    track.style.animation = '';

    requestAnimationFrame(function () {
      var halfW    = track.scrollWidth / 2;
      var speed    = 90;
      var duration = Math.round(halfW / speed);
      track.style.animationDuration = duration + 's';
    });
  }

  function refresh() {
    tickers.forEach(function (t) {
      t.price  = Math.max(t.price  * (1 + (Math.random() * 0.003 - 0.0015)), 0.01);
      t.change = Math.round((t.change + (Math.random() * 0.2 - 0.1)) * 100) / 100;
      t.change = Math.max(-9.99, Math.min(9.99, t.change));
    });
    render();
  }

  function init() {
    render();
    setInterval(refresh, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
