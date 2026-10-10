// Floating webpage companion. Game state remains owned by background.js; this file only renders it.
(() => {
  if (window.top !== window || document.getElementById('focus-friend-widget-host')) return;

  const host = document.createElement('div');
  host.id = 'focus-friend-widget-host';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  root.innerHTML = `<style>
    :host { all:initial; display:block; width:max-content; position:fixed; left:18px; bottom:18px; z-index:2147483647; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:#3B2F4A; }
    * { box-sizing:border-box; }
    #card { position:relative; width:154px; padding:8px 10px 10px; border:1px solid rgba(124,108,240,.2); border-radius:22px; background:rgba(255,250,243,.96); box-shadow:0 10px 30px rgba(54,35,77,.2); backdrop-filter:blur(8px); user-select:none; transition:width .2s, transform .2s; }
    #card:hover { transform:translateY(-2px); }
    #card.mini { width:66px; padding:6px; border-radius:20px; }
    #drag { cursor:grab; touch-action:none; }
    #drag:active { cursor:grabbing; }
    #buddy { width:88px; height:88px; margin:0 auto -3px; }
    #card.mini #buddy { width:52px; height:52px; margin:0; }
    svg { display:block; width:100%; height:100%; }
    .meta { text-align:center; }
    .mini .meta, .mini #open, .mini #health { display:none; }
    #time { color:#6F5DE8; font-size:18px; line-height:1.05; font-weight:850; letter-spacing:.4px; }
    #status { margin-top:3px; color:#756A83; font-size:10px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #health { height:6px; margin:7px 2px 8px; overflow:hidden; border-radius:99px; background:#EDE8F7; }
    #health i { display:block; height:100%; border-radius:inherit; transition:width .35s, background .35s; }
    button { appearance:none; border:0; font:inherit; cursor:pointer; }
    #open { width:100%; padding:6px 8px; border-radius:10px; background:#7C6CF0; color:#fff; font-size:10px; font-weight:800; }
    #toggle { position:absolute; top:6px; right:6px; width:24px; height:24px; padding:0; border-radius:50%; color:#756A83; background:rgba(239,234,251,.9); font-size:14px; line-height:24px; }
    .mini #toggle { top:-7px; right:-7px; box-shadow:0 2px 7px rgba(54,35,77,.2); }
    .wag { transform-origin:84px 112px; animation:wag .5s ease-in-out infinite; }
    .fl { transform-origin:36px 88px; animation:fl .4s ease-in-out infinite; }
    .fr { transform-origin:84px 88px; animation:fr .4s ease-in-out infinite; }
    @keyframes wag { 0%,100% { transform:rotate(-10deg); } 50% { transform:rotate(14deg); } }
    @keyframes fl { 0%,100% { transform:rotate(0); } 50% { transform:rotate(14deg); } }
    @keyframes fr { 0%,100% { transform:rotate(0); } 50% { transform:rotate(-14deg); } }
    @media (prefers-reduced-motion:reduce) { #card { transition:none; } .wag,.fl,.fr { animation:none; } }
  </style>
  <div id="card">
    <div id="drag"><div id="buddy"></div></div>
    <button id="toggle" type="button" title="Minimize Focus Friend" aria-label="Minimize Focus Friend">−</button>
    <div class="meta"><div id="time">Ready!</div><div id="status">Start a focus session</div></div>
    <div id="health"><i></i></div>
    <button id="open" type="button">Open Focus Friend</button>
  </div>`;

  const card = root.getElementById('card');
  const buddy = root.getElementById('buddy');
  const time = root.getElementById('time');
  const status = root.getElementById('status');
  const healthBar = root.querySelector('#health i');
  const toggle = root.getElementById('toggle');
  let st = null, minimized = false, buddyKey = '';
  let dragging = false, startX = 0, startY = 0, startLeft = 18, startTop = 0;

  const pad = n => String(n).padStart(2, '0');
  const fmt = ms => {
    const secs = Math.max(0, Math.ceil(ms / 1000)), hours = Math.floor(secs / 3600), mins = Math.floor(secs % 3600 / 60);
    return (hours ? hours + ':' : '') + pad(mins) + ':' + pad(secs % 60);
  };
  const hueOf = () => { const item = st && ITEMS.find(i => i.id === st.color); return item ? item.hue : 0; };
  function moodOf() {
    const s = st && st.session;
    if (!s) return 'happy';
    if (s.status === 'fainted') return 'fainted';
    if (s.status === 'paused') return 'sleeping';
    const h = health(s);
    return h >= 76 ? 'happy' : h >= 51 ? 'okay' : h >= 26 ? 'sad' : 'panic';
  }
  function render() {
    if (!st) return;
    card.classList.toggle('mini', minimized);
    toggle.textContent = minimized ? '+' : '−';
    toggle.title = minimized ? 'Expand Focus Friend' : 'Minimize Focus Friend';
    toggle.setAttribute('aria-label', toggle.title);
    const mood = moodOf(), key = [st.animal, mood, st.equipped, st.color].join('|');
    if (key !== buddyKey) {
      buddyKey = key;
      buddy.innerHTML = buddySVG(st.animal, mood, { acc: st.equipped, hue: hueOf() });
    }
    const s = st.session;
    if (!s) {
      time.textContent = 'Ready!'; status.textContent = 'Start a focus session'; healthBar.style.width = '100%'; healthBar.style.background = '#5BC47A'; return;
    }
    const h = health(s);
    time.textContent = s.status === 'fainted' ? 'Fainted' : fmt(s.plannedMs - s.activeMs);
    status.textContent = s.status === 'paused' ? 'Session paused' : s.cat === 'distracting' ? 'Back to focus!' : s.cat === 'productive' ? 'Productive site' : 'Focus session';
    healthBar.style.width = h + '%';
    healthBar.style.background = h >= 76 ? '#5BC47A' : h >= 51 ? '#F2C94C' : h >= 26 ? '#F2994A' : '#EB5757';
  }

  toggle.addEventListener('click', e => {
    e.stopPropagation(); minimized = !minimized; chrome.storage.local.set({ ffWidget: { minimized } }); render();
  });
  root.getElementById('open').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openPanel' }));

  root.getElementById('drag').addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; startX = e.clientX; startY = e.clientY;
    const rect = host.getBoundingClientRect(); startLeft = rect.left; startTop = rect.top;
    host.style.left = rect.left + 'px'; host.style.top = rect.top + 'px'; host.style.bottom = 'auto';
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  root.getElementById('drag').addEventListener('pointermove', e => {
    if (!dragging) return;
    const maxX = Math.max(0, innerWidth - host.offsetWidth), maxY = Math.max(0, innerHeight - host.offsetHeight);
    host.style.left = Math.max(0, Math.min(maxX, startLeft + e.clientX - startX)) + 'px';
    host.style.top = Math.max(0, Math.min(maxY, startTop + e.clientY - startY)) + 'px';
  });
  root.getElementById('drag').addEventListener('pointerup', e => { dragging = false; e.currentTarget.releasePointerCapture(e.pointerId); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ff) loadState().then(next => { st = next; render(); });
    if (changes.ffWidget) { minimized = !!(changes.ffWidget.newValue && changes.ffWidget.newValue.minimized); render(); }
  });
  setInterval(() => { if (document.visibilityState === 'visible' && st && st.session) chrome.runtime.sendMessage({ type: 'tick' }); }, 1000);
  Promise.all([loadState(), chrome.storage.local.get('ffWidget')]).then(([next, saved]) => {
    st = next; minimized = !!(saved.ffWidget && saved.ffWidget.minimized); render();
  });
})();
