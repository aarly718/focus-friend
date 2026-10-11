// Side panel UI. It never changes game state itself: it sends actions to background.js and renders what comes back.
let st = null, tab = 'home', lastEvt = -1, sayTimer, toastTimer, buddyKey = '', homeSig = '', shopSig = '', ctx;
const panelPort = chrome.runtime.connect({ name: 'focus-friend-panel' });
let selectedMins = 25, customOpen = false;
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' : '') + pad(m) + ':' + pad(s % 60); };
const send = m => chrome.runtime.sendMessage(m);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const animal = () => ANIMALS.find(a => a[0] === st.animal) || ANIMALS[0];
const hueOf = () => { const c = ITEMS.find(i => i.id === st.color); return c ? c.hue : 0; };
function streakNow() { const t = todayStr(), k = st.streak; return k.last && (k.last === t || k.last === shiftDay(t, -1)) ? k.count : 0; }
function todayMs() { return st.day.date === todayStr() ? st.day.prodMs : 0; }

const SAY = {
  warn: ["Hey... where are you going?", "Psst, that's not studying!", "Come back to me!"],
  five: ["Five minutes left, you got this!"], complete: ["Yay, you did it!", "So proud of you!"],
  moodSad: ["I feel sad. Stay focused!"], moodPanic: ["I'm stressed! Return to your work."],
  moodFinal: ["Hurry! I'm about to faint!"], moodFaint: ["x_x ...help!"],
  streak: ["Streak secured!"], treat: ["Yum, thank you!"], rescue: ["You saved me!"], demo: ["Judge demo ready!"]
};

function say(text) {
  const el = $('speech'); el.textContent = text; el.classList.add('show');
  clearTimeout(sayTimer); sayTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
function toast(text, bad) {
  const el = $('toast'); el.textContent = text; el.className = bad ? 'bad' : ''; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4500);
}
function beep(freqs) {   // optional sound (off by default)
  try {
    ctx = ctx || new AudioContext(); ctx.resume();
    freqs.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * .15); o.stop(ctx.currentTime + (i + 1) * .15); });
  } catch (e) {}
}
function onEvent(e) {
  say(e.type === 'start' ? animal()[2] + " Let's focus!" : pick(SAY[e.type] || ['Hi!']));
  if (['five', 'complete', 'moodSad', 'moodPanic', 'moodFinal', 'moodFaint', 'streak', 'demo'].includes(e.type))
    toast(e.text, ['moodPanic', 'moodFinal', 'moodFaint'].includes(e.type));
  if (st.settings.sound) beep(['warn', 'moodPanic', 'moodFinal', 'moodFaint'].includes(e.type) ? [400, 300, 200] : ['complete', 'streak'].includes(e.type) ? [523, 659, 784] : []);
}

function moodOf() {
  const s = st.session;
  if (!s) return 'happy';
  if (s.status === 'fainted') return 'fainted';
  if (s.status === 'paused') return 'sleeping';
  const h = health(s);
  return h >= 76 ? 'happy' : h >= 51 ? 'okay' : h >= 26 ? 'sad' : 'panic';
}
function renderBuddy() {
  const mood = moodOf(), key = [st.animal, mood, st.equipped, st.color].join('|');
  if (key === buddyKey) return;               // only redraw when something visible changed (keeps animations smooth)
  buddyKey = key;
  $('buddy').innerHTML = buddySVG(st.animal, mood, { acc: st.equipped, hue: hueOf() });
  const aura = $('buddyAura');
  aura.className = 'buddy-aura aura-' + mood;
  aura.innerHTML = auraHTML(mood);
}

/* ---------------- Focus screen ---------------- */
function buildHome() {
  const s = st.session, min = st.settings.demo ? 1 : MIN_SESSION;
  if (!s) {
    const l = st.last;
    const res = !l ? '' : l.ok
      ? `<div class="result"><b>Session complete!</b> +${l.total} points<br><span class="muted">${l.base} focused min + ${l.bonus} health bonus (health ${l.health}%)</span><div class="btns"><button data-a="dismiss">Nice!</button></div></div>`
      : `<div class="result fail"><b>Session ended.</b> No points this time, but your daily streak progress is safe. Try again!<div class="btns"><button data-a="dismiss">OK</button></div></div>`;
    return `${res}<div class="duration-title">Choose a focus time</div>
      <div class="chips duration-chips">${[15, 25, 45, 60].map(n => `<button data-set="${n}" class="${!customOpen && selectedMins === n ? 'selected' : ''}">${n} min</button>`).join('')}<button data-custom class="${customOpen ? 'selected' : ''}">Custom</button></div>
      <div class="custom-time" id="customTime" ${customOpen ? '' : 'hidden'}>
        <button type="button" data-a="decMins" aria-label="Subtract five minutes">−</button>
        <label for="mins"><span>Custom duration</span><span class="minutes-input"><input id="mins" type="number" min="${min}" max="600" value="${selectedMins}"> min</span></label>
        <button type="button" data-a="incMins" aria-label="Add five minutes">+</button>
      </div>
      <div class="btns"><button class="primary" data-a="start">Start focusing</button></div>
      <div class="prog">Today: <b id="prog"></b> of ${STREAK_MIN} min toward your daily streak${st.settings.demo ? '<br>Demo mode is ON (time runs 30x faster)<div class="btns demo-tools"><button data-a="demoPrep">Prepare judge demo</button></div>' : ''}</div>`;
  }
  if (s.status === 'fainted') {
    const rescueCost = st.settings.demo ? 'Free in demo' : `${RESCUE_COST} pts`;
    return `<div class="goal">${esc(s.goal)}</div><div class="fainted-msg">Your buddy fainted!</div>
      <p class="muted" style="text-align:center">${s.rescued ? 'It was already rescued once this session.' : st.settings.demo ? `Demo rescue is free and restores ${RESCUE_HEALTH} health.` : `Rescue it for ${RESCUE_COST} points and it comes back with ${RESCUE_HEALTH} health.`}</p>
      <div class="btns"><button class="warn-btn" data-a="rescue" ${!s.rescued && (st.settings.demo || st.points >= RESCUE_COST) ? '' : 'disabled'}>Rescue (${rescueCost})</button><button data-a="end">End session</button></div>`;
  }
  const over = s.host ? `<div class="mini">For this session, treat <b>${esc(s.host)}</b> as: ${['productive', 'neutral', 'distracting'].map(c => `<button data-a="override" data-cat="${c}">${c}</button>`).join('')}</div>` : '';
  return `<div class="goal">${esc(s.goal)}</div><div class="tm" id="tm"></div>
    <div id="warn" class="warn" hidden></div>
    <div class="site">Current site: <b>${esc(s.host || 'not a website')}</b> <span id="catlbl" class="tag"></span></div>${over}
    <div class="btns">
      <button data-a="${s.status === 'paused' ? 'resume' : 'pause'}">${s.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button data-a="treat" ${st.points >= TREAT_COST ? '' : 'disabled'}>Treat (${TREAT_COST} pts)</button>
      <button class="ghost" data-a="end">End session</button>
    </div>
    ${st.settings.demo ? '<div class="btns demo-tools"><button data-a="demoMood">Demo: next mood</button></div>' : ''}
    ${s.status === 'paused' ? '<p class="muted">Paused. Paused time does not count toward points or your streak.</p>' : ''}`;
}
function updateDyn() {
  const s = st.session;
  if ($('prog')) $('prog').textContent = Math.floor(todayMs() / MIN);
  const h = s ? health(s) : 100;
  const hbar = $('hbar'), hnum = $('hnum'), buddyState = $('buddyState');
  hbar.style.width = h + '%';
  hbar.style.background = h >= 76 ? '#5BC47A' : h >= 51 ? '#F2C94C' : h >= 26 ? '#F2994A' : '#EB5757';
  hbar.parentElement.setAttribute('aria-valuenow', h);
  hnum.textContent = h + '% health';
  buddyState.textContent = !s ? 'Ready to focus!' : s.status === 'fainted' ? 'I need a rescue' : s.status === 'paused' ? 'Resting with you' : h >= 76 ? 'Doing great!' : h >= 51 ? 'Still going!' : h >= 26 ? 'Stay with me!' : 'Let\'s get back on track!';
  if (!s || s.status === 'fainted') return;
  $('tm').textContent = fmt(s.plannedMs - s.activeMs);
  const c = $('catlbl'); c.textContent = s.cat; c.className = 'tag ' + s.cat;
  const w = $('warn');
  if (s.cat === 'distracting' && s.status === 'running') {
    w.hidden = false;
    w.textContent = s.graceLeft > 0 ? `Your buddy is getting distracted! Leave within ${Math.ceil(s.graceLeft / 1000)}s to keep your health.` : 'Your buddy is losing health. Head back to your work!';
  } else w.hidden = true;
}
function renderHome() {
  const s = st.session;
  const sig = [s ? s.status : 'idle', !!st.last, s && s.rescued, st.points >= TREAT_COST, st.points >= RESCUE_COST, s && s.host, st.settings.demo, s && s.notifyStage].join('|');
  if (sig !== homeSig) { homeSig = sig; $('homeBody').innerHTML = buildHome(); }
  updateDyn();
}

/* ---------------- Shop ---------------- */
function card(pv, name, btn, on) { return `<div class="item ${on ? 'on' : ''}"><div class="pv">${pv}</div><b>${esc(name)}</b>${btn}</div>`; }
function renderShop() {
  const demoUnlocked = demoItemsUnlocked(st);
  const sig = JSON.stringify([st.points, st.items, st.animals, st.animal, st.equipped, st.color, demoUnlocked]);
  if (sig === shopSig) return;
  shopSig = sig;
  const acc = ITEMS.filter(i => i.type === 'acc').map(i => {
    const own = st.items.includes(i.id) || demoUnlocked, on = st.equipped === i.id;
    return card(buddySVG(st.animal, 'happy', { acc: i.id }), i.name, `<button data-a="item" data-id="${i.id}" ${!own && st.points < i.cost ? 'disabled' : ''}>${on ? 'Remove' : own ? 'Wear' : '⭐ ' + i.cost}</button>`, on);
  }).join('');
  const col = ITEMS.filter(i => i.type === 'color').map(i => {
    const own = st.items.includes(i.id) || demoUnlocked, on = st.color === i.id;
    return card(buddySVG(st.animal, 'happy', { hue: i.hue }), i.name.replace(' color', ''), `<button data-a="item" data-id="${i.id}" ${!own && st.points < i.cost ? 'disabled' : ''}>${on ? 'Remove' : own ? 'Use' : '⭐ ' + i.cost}</button>`, on);
  }).join('');
  const ani = ANIMALS.map(a => {
    const own = st.animals.includes(a[0]) || demoUnlocked, on = st.animal === a[0];
    return card(buddySVG(a[0], 'happy'), a[1], `<button data-a="animal" data-id="${a[0]}" ${!own && st.points < ANIMAL_COST ? 'disabled' : ''}>${on ? 'Active' : own ? 'Choose' : '⭐ ' + ANIMAL_COST}</button>`, on);
  }).join('');
  $('shop').innerHTML = `${demoUnlocked ? '<div class="result"><b>Demo unlocks are on.</b> Every animal, accessory, and color is free to try.</div>' : ''}<div class="card"><b>Treat</b> costs ${TREAT_COST} points and restores ${TREAT_HEAL} health. Use it from the Focus screen during a session.</div>
    <h3>Accessories (wear one at a time)</h3><div class="grid">${acc}</div>
    <h3>Special colors</h3><div class="grid">${col}</div>
    <h3>New animals</h3><div class="grid">${ani}</div>`;
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const s = st.settings;
  $('settings').innerHTML = `<div class="card">
    <div class="row"><input type="checkbox" id="sSound" ${s.sound ? 'checked' : ''}><label for="sSound" style="margin:0">Play sounds (off by default)</label></div>
    <div class="row"><input type="checkbox" id="sDemo" ${s.demo ? 'checked' : ''}><label for="sDemo" style="margin:0">Demo mode: time runs 30x faster, 1 minute sessions allowed</label></div>
    <div class="row suboption"><input type="checkbox" id="sDemoUnlocks" ${s.demoUnlocks ? 'checked' : ''}><label for="sDemoUnlocks" style="margin:0">Unlock all animals, accessories, and colors while demo mode is on</label></div></div>
    ${s.demo ? '<div class="card demo-card"><b>Judge demo shortcut</b><p class="muted">Seeds 100 rescue points and sets today to 14 of 15 streak minutes. Your next focused minute secures the streak.</p><div class="btns"><button data-a="demoPrep">Prepare judge demo</button></div></div>' : ''}
    <label for="sProd">Productive sites (one per line)</label><textarea id="sProd">${esc(s.productive.join('\n'))}</textarea>
    <label for="sDist">Distracting sites (one per line)</label><textarea id="sDist">${esc(s.distracting.join('\n'))}</textarea>
    <p class="muted">Sites on neither list are neutral and do nothing. YouTube and Reddit start as neutral because they can contain study material. Only totals and settings are stored on your computer, never your browsing history.</p>
    <div class="btns"><button class="primary" data-a="saveSettings">Save settings</button></div>
    <div class="btns"><button class="ghost" data-a="reset">Reset all data</button></div>`;
}

/* ---------------- wiring ---------------- */
function render() {
  if (!st) return;
  $('pts').textContent = '⭐ ' + st.points; $('str').textContent = '🔥 ' + streakNow();
  for (const id of ['home', 'shop', 'settings']) $(id).hidden = id !== tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.s === tab));
  renderBuddy();
  if (tab === 'home') renderHome();
  if (tab === 'shop') renderShop();
}
function setTab(t) { tab = t; if (t === 'settings') renderSettings(); if (t === 'shop') shopSig = ''; render(); }

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.s) return setTab(b.dataset.s);
  if (b.dataset.set) {
    selectedMins = Number(b.dataset.set); customOpen = false; homeSig = ''; renderHome(); return;
  }
  if (Object.prototype.hasOwnProperty.call(b.dataset, 'custom')) {
    customOpen = true; homeSig = ''; renderHome(); $('mins').focus(); return;
  }
  const a = b.dataset.a; if (!a) return;
  if (a === 'decMins' || a === 'incMins') {
    const input = $('mins'), min = st.settings.demo ? 1 : MIN_SESSION;
    const step = st.settings.demo && Number(input.value) <= 5 ? 1 : 5;
    selectedMins = Math.max(min, Math.min(600, Number(input.value || selectedMins) + (a === 'incMins' ? step : -step)));
    input.value = selectedMins; return;
  }
  if (a === 'start') {
    const mins = customOpen ? Number($('mins').value) : selectedMins, min = st.settings.demo ? 1 : MIN_SESSION;
    if (!(mins >= min)) return toast(`Sessions must be at least ${min} minute${min > 1 ? 's' : ''}.`, true);
    if (mins > 600) return toast('Sessions cannot be longer than 600 minutes.', true);
    selectedMins = Math.round(mins);
    return send({ type: 'start', goal: 'Focus session', mins: selectedMins });
  }
  if (a === 'saveSettings') {
    const lines = id => $(id).value.split('\n');
    send({ type: 'settings', settings: { sound: $('sSound').checked, demo: $('sDemo').checked, demoUnlocks: $('sDemoUnlocks').checked, productive: lines('sProd'), distracting: lines('sDist') } });
    return toast('Settings saved');
  }
  if (a === 'reset') { if (confirm('Reset your points, animals, and streak? This cannot be undone.')) send({ type: 'reset' }); return; }
  send({ type: a, id: b.dataset.id, host: st.session && st.session.host, cat: b.dataset.cat });
});

function apply(next) {
  st = next;
  if (lastEvt < 0 || st.eid < lastEvt) lastEvt = st.eid || 0;   // don't replay old events (also handles a data reset)
  for (const e of st.events || []) if (e.id > lastEvt) { lastEvt = e.id; onEvent(e); }
  render();
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local') loadState().then(apply);   // storage cleared (reset) also lands here with defaults
});
setInterval(() => { if (st && st.session) send({ type: 'tick' }); }, 1000);   // keeps the clock honest while the panel is open
loadState().then(s => { apply(s); homeSig = ''; render(); });
