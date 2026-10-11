// Service worker: the single source of truth. The side panel only sends actions and renders state.
importScripts('shared.js');

let queue = Promise.resolve();                       // run actions one at a time so saves never race
const enqueue = m => { queue = queue.then(() => act(m)).catch(e => console.error(e)); return queue; };
let panelOpen = false;
const canClosePanel = typeof chrome.sidePanel.close === 'function';

/* ---------- offscreen sound playback ---------- */
let offscreenCreating = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const open = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (open.length) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play Focus Friend sound effects'
    }).finally(() => { offscreenCreating = null; });
  }
  await offscreenCreating;
}
async function playSounds(st, ids) {
  const audio = st.settings;
  if (!ids.length || audio.muted || !(audio.volume > 0)) return;
  try {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'sound', sounds: ids, volume: audio.volume, pitch: ANIMAL_PITCH[st.animal] || 1 });
  } catch (error) { console.warn('Focus Friend sound failed:', error); }
}

function publishPanelState() {
  chrome.storage.local.set({ ffPanel: { open: panelOpen, canClose: canClosePanel } });
}

async function currentTab() {
  try { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t || null; }
  catch (e) { return null; }
}

function applyTab(st, tab) {
  const s = st.session;
  if (!s) return;
  const was = s.cat;
  s.host = tab && tab.url ? hostOf(tab.url) : '';
  s.cat = classify(s.host, st);
  if (s.cat === 'distracting' && was !== 'distracting') { s.graceLeft = GRACE; evt(st, 'warn', 'Your buddy is getting distracted!'); }
}

function cleanDomain(x) { return String(x).toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }

function commit(st) {
  const fresh = (st.events || []).filter(e => e.id > st.notified);
  // Use a new notification for each alert so Chrome/Windows presents a fresh
  // banner. Once fainted, only the faint alert is allowed until rescue/new start.
  const muted = !!(st.session && st.session.notificationsMuted);
  const notificationEvent = fresh.filter(e => {
    if (e.type === 'moodFaint') return true;
    return !muted && ['warn', 'moodOkay', 'moodSad', 'moodPanic', 'moodFinal'].includes(e.type);
  }).pop();
  if (notificationEvent)
    chrome.notifications.create('', { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Focus Friend', message: notificationEvent.text, priority: 2, silent: true })
      .catch(error => console.warn('Focus Friend notification failed:', error));
  const plan = planSounds(st, fresh, st.lastMood);
  st.lastMood = moodKey(st);
  if (fresh.length) st.notified = fresh[fresh.length - 1].id;
  const saved = saveState(st);
  playSounds(st, plan); // Do not delay state updates while audio initializes.
  return saved;
}

async function act(m) {
  const st = await loadState(), now = Date.now();
  if (m.type === 'startup') {                        // closing Chrome pauses the session
    if (st.session && st.session.status === 'running') st.session.status = 'paused';
    return commit(st);
  }
  if (!st.session && (m.type === 'tick' || m.type === 'refresh')) return;
  advance(st, now);
  const s = st.session;
  let preview = null;
  switch (m.type) {
    case 'start': {
      if (s) break;
      const mins = Math.round(Number(m.mins)), min = st.settings.demo ? 1 : MIN_SESSION;
      if (!(mins >= min) || mins > 600) break;
      st.last = null; st.lastSessionDate = todayStr();
      st.session = { goal: String(m.goal || '').trim().slice(0, 80) || 'Focus session', plannedMs: mins * MIN, activeMs: 0, prodMs: 0,
        distMs: 0, graceLeft: GRACE, status: 'running', cat: 'neutral', host: '', lastTick: now, overrides: {}, rescued: false, fiveSent: false,
        notifyStage: 0, notificationsMuted: false };
      evt(st, 'start', 'Session started');
      applyTab(st, await currentTab());
      break;
    }
    case 'pause': if (s && s.status === 'running') s.status = 'paused'; break;
    case 'resume': if (s && s.status === 'paused') { s.status = 'running'; s.lastTick = now; applyTab(st, await currentTab()); } break;
    case 'refresh': if (s) applyTab(st, await currentTab()); break;
    case 'end':     // emergency exit: no points (productive minutes already counted toward the daily streak stay)
      if (s) { st.last = { ok: false, goal: s.goal }; st.session = null; }
      break;
    case 'treat':
      if (s && s.status !== 'fainted' && st.points >= TREAT_COST && health(s) < 100) {
        st.points -= TREAT_COST; s.distMs = Math.max(0, s.distMs - TREAT_HEAL / 100 * allowedMs(s));
        // Recovering above a threshold allows a future downward crossing to alert again.
        s.notifyStage = Math.min(s.notifyStage || 0, moodAlertStage(health(s)));
        evt(st, 'treat', 'Yum! +20 health');
      }
      break;
    case 'rescue':
      if (s && s.status === 'fainted' && !s.rescued && (st.settings.demo || st.points >= RESCUE_COST)) {
        if (!st.settings.demo) st.points -= RESCUE_COST;
        s.rescued = true; s.status = 'running'; s.lastTick = now; s.graceLeft = GRACE;
        s.distMs = allowedMs(s) * (1 - RESCUE_HEALTH / 100); s.notifyStage = moodAlertStage(RESCUE_HEALTH); s.notificationsMuted = false;
        evt(st, 'rescue', 'Buddy rescued!');
      }
      break;
    case 'demoMood':
      if (s && s.status === 'running' && st.settings.demo) {
        const next = Math.min(5, (s.notifyStage || moodAlertStage(health(s))) + 1);
        const healthByStage = [100, 75, 50, 25, 10, 0];
        s.distMs = allowedMs(s) * (1 - healthByStage[next] / 100);
        if (next === 5) s.status = 'fainted';
        updateMoodAlert(st);
      }
      break;
    case 'demoPrep':
      if (st.settings.demo) {
        const t = todayStr();
        if (st.day.date !== t) st.day = { date: t, prodMs: 0, secured: false };
        if (!st.day.secured) st.day.prodMs = Math.max(st.day.prodMs, 14 * MIN);
        st.points = Math.max(st.points, 100);
        evt(st, 'demo', 'Judge demo ready: 100 points and 14 streak minutes.');
      }
      break;
    case 'override':
      if (s && m.host && ['productive', 'distracting', 'neutral'].includes(m.cat)) { s.overrides[m.host] = m.cat; applyTab(st, await currentTab()); }
      break;
    case 'item': {
      const it = ITEMS.find(i => i.id === m.id);
      if (!it) break;
      const unlocked = demoItemsUnlocked(st);
      if (!st.items.includes(it.id) && !unlocked) {
        if (st.points < it.cost) break;
        st.points -= it.cost; st.items.push(it.id);
        if (it.type === 'acc') st.equipped = it.id; else st.color = it.id;
      } else if (it.type === 'acc') st.equipped = st.equipped === it.id ? null : it.id;
      else st.color = st.color === it.id ? null : it.id;
      break;
    }
    case 'animal': {
      if (!ANIMAL_IDS.includes(m.id)) break;
      if (!st.animals.includes(m.id) && !demoItemsUnlocked(st)) { if (st.points < ANIMAL_COST) break; st.points -= ANIMAL_COST; st.animals.push(m.id); }
      st.animal = m.id;
      break;
    }
    case 'settings': {
      const c = m.settings || {};
      const hadDemoUnlocks = demoItemsUnlocked(st);
      st.settings.demo = !!c.demo; st.settings.demoUnlocks = !!c.demoUnlocks;
      if (Array.isArray(c.productive)) st.settings.productive = [...new Set(c.productive.map(cleanDomain).filter(Boolean))];
      if (Array.isArray(c.distracting)) st.settings.distracting = [...new Set(c.distracting.map(cleanDomain).filter(Boolean))];
      if (hadDemoUnlocks && !demoItemsUnlocked(st)) {
        if (st.equipped && !st.items.includes(st.equipped)) st.equipped = null;
        if (st.color && !st.items.includes(st.color)) st.color = null;
        if (!st.animals.includes(st.animal)) st.animal = st.animals[0] || 'retriever';
      }
      if (st.session) applyTab(st, await currentTab());
      break;
    }
    case 'audio': {
      const audio = st.settings;
      if (typeof m.volume === 'number') {
        audio.volume = Math.max(0, Math.min(100, Math.round(m.volume)));
        if (audio.volume > 0 && m.autoUnmute) audio.muted = false;
      }
      if (typeof m.muted === 'boolean') audio.muted = m.muted;
      if (m.preview && !audio.muted && audio.volume > 0) preview = 'happy';
      break;
    }
    case 'testSound': if (SOUND_IDS.includes(m.id)) preview = m.id; break;
    case 'dismiss': st.last = null; break;
    case 'reset': await chrome.storage.local.clear(); return;
    case 'alarm':
      if (!st.session && st.lastSessionDate && st.inactiveNotified !== todayStr() && daysBetween(st.lastSessionDate, todayStr()) >= 3) {
        st.inactiveNotified = todayStr();
      }
      break;
  }
  settle(st);
  const done = await commit(st);
  if (preview) await playSounds(st, [preview]);
  return done;
}

chrome.runtime.onMessage.addListener((m, sender) => {
  // A click inside the webpage widget is a valid user gesture for opening the panel.
  // Handle it immediately instead of putting it through the state-update queue.
  if (m && m.type === 'openPanel' && sender.tab && sender.tab.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(e => console.error(e));
    return;
  }
  if (m && m.type === 'togglePanel' && sender.tab && sender.tab.id) {
    if (panelOpen && canClosePanel) chrome.sidePanel.close({ windowId: sender.tab.windowId }).catch(e => console.error(e));
    else chrome.sidePanel.open({ tabId: sender.tab.id }).catch(e => console.error(e));
    return;
  }
  enqueue(m);
});
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'focus-friend-panel') return;
  panelOpen = true; publishPanelState();
  port.onDisconnect.addListener(() => { panelOpen = false; publishPanelState(); });
});
chrome.tabs.onActivated.addListener(() => enqueue({ type: 'refresh' }));
chrome.tabs.onUpdated.addListener((id, ch, tab) => { if (tab.active && (ch.url || ch.status === 'complete')) enqueue({ type: 'refresh' }); });
chrome.windows.onFocusChanged.addListener(() => enqueue({ type: 'refresh' }));
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') enqueue({ type: 'alarm' }); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 0.5 }); enqueue({ type: 'startup' }); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 0.5 }); });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
publishPanelState();
