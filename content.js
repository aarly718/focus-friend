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
    #pet-stage { position:relative; width:104px; height:94px; margin:0 auto -3px; isolation:isolate; }
    #pet-circle { position:absolute; left:50%; top:50%; width:92px; height:92px; transform:translate(-50%,-50%); border-radius:50%; background:#EEE9FF; box-shadow:inset 0 0 0 1px #D8D0FF; transition:box-shadow .12s,transform .12s; }
    #card.pet-active #pet-circle { box-shadow:inset 0 0 0 2px #3B2F4A; transform:translate(-50%,-50%) scale(.98); }
    #buddy { position:absolute; left:50%; bottom:-2px; z-index:2; width:88px; height:88px; transform:translateX(-50%); }
    #card.mini #pet-stage { width:52px; height:52px; margin:0; }
    #card.mini #pet-circle { width:52px; height:52px; }
    #card.mini #buddy { width:50px; height:50px; bottom:-1px; }
    .buddy-aura { position:absolute; inset:0; z-index:1; pointer-events:none; overflow:visible; }
    .aura-particle { position:absolute; left:var(--x); top:var(--y); font-weight:900; line-height:1; opacity:0; }
    .aura-happy .heart { color:#FF7FA1; font-size:11px; animation:aura-float 2.4s ease-in-out var(--delay) infinite; }
    .aura-happy .sparkle { color:#F4C84A; font-size:12px; animation:aura-twinkle 1.8s ease-in-out var(--delay) infinite; }
    .aura-sad .drop { color:#72AEEB; font-size:9px; animation:aura-rain 2s ease-in var(--delay) infinite; }
    .aura-sad .mist { color:#8CA7C8; font-size:17px; animation:aura-mist 2.6s ease-in-out var(--delay) infinite; }
    .aura-panic .alert { color:#F06D75; font-size:13px; animation:aura-alert .72s ease-in-out var(--delay) infinite; }
    .aura-panic .bolt { color:#F3B63D; font-size:13px; animation:aura-alert .58s ease-in-out var(--delay) infinite reverse; }
    .aura-fainted .faint-star,.aura-fainted .faint-dot { color:#9A8ED4; font-size:12px; animation:aura-orbit 2.8s linear var(--delay) infinite; }
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
    .tail { transform-box:view-box; transform-origin:84px 112px; }
    .wag { animation:wag .55s ease-in-out infinite; }
    .tail-sway { animation:tail-sway 2.2s ease-in-out infinite; }
    .tail-droop { transform:rotate(38deg); }
    .tail-faint { transform:rotate(48deg); }
    .tail-twitch { animation:tail-twitch .28s steps(2,end) infinite; }
    .mood-happy .ears { transform-box:view-box; transform-origin:60px 50px; animation:ear-perk 2.1s ease-in-out infinite; }
    .mood-panic .ears { transform-box:view-box; transform-origin:60px 50px; animation:ear-startle .42s ease-in-out infinite alternate; }
    .fl { transform-origin:36px 88px; animation:fl .4s ease-in-out infinite; }
    .fr { transform-origin:84px 88px; animation:fr .4s ease-in-out infinite; }
    @keyframes wag { 0%,100% { transform:rotate(-10deg); } 50% { transform:rotate(14deg); } }
    @keyframes tail-sway { 0%,100% { transform:rotate(-3deg); } 50% { transform:rotate(6deg); } }
    @keyframes tail-twitch { 0% { transform:rotate(-5deg); } 100% { transform:rotate(9deg); } }
    @keyframes ear-perk { 0%,76%,100% { transform:translateY(0) scaleY(1); } 82% { transform:translateY(-2px) scaleY(1.05); } 88% { transform:translateY(1px) scaleY(.97); } }
    @keyframes ear-startle { from { transform:translateY(0) scaleY(1); } to { transform:translateY(-2px) scaleY(1.04); } }
    @keyframes fl { 0%,100% { transform:rotate(0); } 50% { transform:rotate(14deg); } }
    @keyframes fr { 0%,100% { transform:rotate(0); } 50% { transform:rotate(-14deg); } }
    @keyframes aura-float { 0% { opacity:0; transform:translateY(5px) scale(.7); } 25%,70% { opacity:1; } 100% { opacity:0; transform:translateY(-10px) scale(1.1); } }
    @keyframes aura-twinkle { 0%,100% { opacity:.15; transform:scale(.65) rotate(0); } 50% { opacity:1; transform:scale(1.15) rotate(28deg); } }
    @keyframes aura-rain { 0% { opacity:0; transform:translateY(-5px); } 25% { opacity:.9; } 100% { opacity:0; transform:translateY(11px); } }
    @keyframes aura-mist { 0%,100% { opacity:.15; transform:translateX(-3px); } 50% { opacity:.55; transform:translateX(5px); } }
    @keyframes aura-alert { 0%,100% { opacity:.25; transform:scale(.8) rotate(-6deg); } 50% { opacity:1; transform:scale(1.18) rotate(6deg); } }
    @keyframes aura-orbit { 0% { opacity:0; transform:rotate(0) translateX(2px); } 25%,70% { opacity:.8; } 100% { opacity:0; transform:rotate(360deg) translateX(2px); } }
    @media (prefers-reduced-motion:reduce) { #card { transition:none; } .wag,.tail-sway,.tail-twitch,.mood-happy .ears,.mood-panic .ears,.fl,.fr,.aura-particle { animation:none; } .aura-particle { opacity:.65; } }
  </style>
  <div id="card">
    <div id="drag"><div id="pet-stage"><div id="pet-circle" aria-hidden="true"></div><div id="buddyAura" class="buddy-aura" aria-hidden="true"></div><div id="buddy"></div></div></div>
    <button id="toggle" type="button" title="Minimize Focus Friend" aria-label="Minimize Focus Friend">−</button>
    <div class="meta"><div id="time">Ready!</div><div id="status">Start a focus session</div></div>
    <div id="health"><i></i></div>
    <button id="open" type="button">Open Focus Friend</button>
  </div>`;

  const card = root.getElementById('card');
  const buddy = root.getElementById('buddy');
  const buddyAura = root.getElementById('buddyAura');
  const time = root.getElementById('time');
  const status = root.getElementById('status');
  const healthBar = root.querySelector('#health i');
  const toggle = root.getElementById('toggle');
  let st = null, minimized = false, buddyKey = '';
  let dragging = false, dragMoved = false, startX = 0, startY = 0, startLeft = 18, startTop = 0;

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
      buddyAura.className = 'buddy-aura aura-' + mood;
      buddyAura.innerHTML = auraHTML(mood);
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
    dragging = true; dragMoved = false; startX = e.clientX; startY = e.clientY; card.classList.add('pet-active');
    const rect = host.getBoundingClientRect(); startLeft = rect.left; startTop = rect.top;
    host.style.left = rect.left + 'px'; host.style.top = rect.top + 'px'; host.style.bottom = 'auto';
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  root.getElementById('drag').addEventListener('pointermove', e => {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 5) dragMoved = true;
    const maxX = Math.max(0, innerWidth - host.offsetWidth), maxY = Math.max(0, innerHeight - host.offsetHeight);
    host.style.left = Math.max(0, Math.min(maxX, startLeft + e.clientX - startX)) + 'px';
    host.style.top = Math.max(0, Math.min(maxY, startTop + e.clientY - startY)) + 'px';
  });
  root.getElementById('drag').addEventListener('pointerup', e => {
    dragging = false; card.classList.remove('pet-active'); e.currentTarget.releasePointerCapture(e.pointerId);
    if (!dragMoved) chrome.runtime.sendMessage({ type: 'openPanel' });
  });
  root.getElementById('drag').addEventListener('pointercancel', () => { dragging = false; card.classList.remove('pet-active'); });

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
