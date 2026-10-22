// Scrolling price bar. Shows REAL delayed quotes from ticker.json, which a
// scheduled GitHub Action (.github/workflows/ticker-data.yml) publishes to the
// `ticker-data` branch. No API keys in the browser and no per-visitor API calls.
// If no data can be loaded the bar is hidden - it never shows invented numbers.
(function () {
  var REMOTE = 'https://raw.githubusercontent.com/Cedric-Chassang/enthusia-capital/ticker-data/ticker.json';
  var isLocal = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0;
  var SOURCES = isLocal ? ['data/ticker.json', REMOTE] : [REMOTE];
  var REFRESH_MS = 10 * 60 * 1000;
  var lastKey = '';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(price) {
    return Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function asOf(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  }

  function buildHTML(data) {
    var items = (data.items || []).filter(function (t) {
      return t && t.label && isFinite(t.price) && t.price > 0 && isFinite(t.change);
    });
    if (!items.length) return '';
    var html = items.map(function (t) {
      var up = t.change >= 0;
      return '<span class="tick-item">' +
        '<span class="tick-symbol">' + esc(t.label) + '</span>' +
        '<span class="tick-price">' + fmt(t.price) + '</span>' +
        '<span class="tick-change ' + (up ? 'tick-up' : 'tick-down') + '">' + (up ? '▲' : '▼') +
        '&nbsp;' + (up ? '+' : '') + Number(t.change).toFixed(2) + '%</span>' +
        '</span>';
    }).join('<span class="tick-sep"></span>');
    return html + '<span class="tick-sep"></span><span class="tick-item">' +
      '<span class="tick-symbol">Delayed · as of ' + esc(asOf(data.generatedAt)) + '</span></span>';
  }

  function hide() {
    var bar = document.querySelector('.ticker-bar');
    if (bar) bar.style.display = 'none';
    var nav = document.querySelector('nav');
    if (nav) nav.style.top = '0';           // nav is sticky at top:34px under the bar
  }

  function render(data) {
    var track = document.getElementById('ticker-track');
    if (!track) return;
    var html = buildHTML(data);
    if (!html) { if (!lastKey) hide(); return; }
    if (html === lastKey) return;            // unchanged: don't restart the scroll
    lastKey = html;
    var gap = '<span class="tick-gap"></span>';
    track.innerHTML = html + gap + html + gap;
    track.style.animation = 'none';
    track.offsetHeight;
    track.style.animation = '';
    requestAnimationFrame(function () {
      track.style.animationDuration = Math.round(track.scrollWidth / 2 / 90) + 's';
    });
  }

  function load(i) {
    i = i || 0;
    if (i >= SOURCES.length) { if (!lastKey) hide(); return; }
    var bust = Math.floor(Date.now() / 300000);  // matches the 5-min CDN cache
    fetch(SOURCES[i] + '?v=' + bust, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(function () { load(i + 1); });  // on failure keep showing last real values
  }

  function init() {
    load();
    setInterval(load, REFRESH_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
