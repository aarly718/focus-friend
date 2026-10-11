// Game rules + pure logic. Loaded by background.js (importScripts) and sidepanel.html (<script>).
// Nothing in here touches the DOM, so it is easy to test (see tests/logic.test.js).

const MIN = 60000;
const GRACE = 10000;          // ms on a distracting site before health starts dropping
const FRACTION = 0.2;         // allowed distraction time = 20% of the planned session
const STREAK_MIN = 15;        // productive minutes needed per day to secure the streak
const MIN_SESSION = 15;       // minimum session length in minutes
const RESCUE_COST = 20, RESCUE_HEALTH = 30;
const TREAT_COST = 10, TREAT_HEAL = 20;
const ANIMAL_COST = 200;
const DEMO_SPEED = 30;        // demo mode makes session time run 30x faster
const DEMO_DAMAGE_SPEED = 10; // slower than the demo clock so each mood remains visible
const MOOD_ALERTS = [
  null,
  { type: 'moodSad', text: 'Your buddy is sad. Stay focused!' },
  { type: 'moodPanic', text: 'Your buddy is stressed! Return to your work.' },
  { type: 'moodFinal', text: 'Hurry! Your buddy is about to faint!' },
  { type: 'moodFaint', text: 'Your buddy fainted. Rescue it or end the session.' }
];

const DEFAULT_PRODUCTIVE = ['docs.google.com', 'drive.google.com', 'classroom.google.com', 'instructure.com',
  'khanacademy.org', 'scholar.google.com', 'wikipedia.org', 'notion.so', 'desmos.com'];
const DEFAULT_DISTRACTING = ['tiktok.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'netflix.com',
  'disneyplus.com', 'hulu.com', 'twitch.tv', 'kick.com', 'store.steampowered.com'];
// YouTube and Reddit are intentionally NOT listed: they can contain study material (neutral by default).

const ITEMS = [
  { id: 'bow',      name: 'Bow',            cost: 50,  type: 'acc' },
  { id: 'glasses',  name: 'Glasses',        cost: 50,  type: 'acc' },
  { id: 'hat',      name: 'Top hat',        cost: 75,  type: 'acc' },
  { id: 'mint',     name: 'Mint color',     cost: 100, type: 'color', hue: 90 },
  { id: 'lavender', name: 'Lavender color', cost: 100, type: 'color', hue: 220 },
  { id: 'pink',     name: 'Pink color',     cost: 100, type: 'color', hue: 300 }
];
const ANIMAL_IDS = ['retriever', 'shepherd', 'corgi', 'husky', 'dalmatian', 'pug', 'tabby', 'blackcat', 'bunny', 'fox',
  'wolf', 'panda', 'polarbear', 'brownbear', 'koala', 'raccoon', 'redpanda', 'otter', 'capybara', 'pig', 'cow',
  'sheep', 'lion', 'tiger', 'monkey', 'penguin', 'owl', 'chicken', 'duck', 'frog'];

/* ---------- dates ---------- */
const todayStr = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const shiftDay = (s, n) => { const [y, m, d] = s.split('-').map(Number); return todayStr(new Date(y, m - 1, d + n)); };
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const daysBetween = (a, b) => dayNum(b) - dayNum(a);

/* ---------- state (stored locally, never synced; only totals and settings, no browsing history) ---------- */
const DEFAULT_STATE = () => ({
  points: 0, best: 0, totalMin: 0,
  animal: 'retriever', animals: ['retriever'], items: [], equipped: null, color: null,
  settings: { muted: true, volume: 60, demo: false, demoUnlocks: false, productive: DEFAULT_PRODUCTIVE.slice(), distracting: DEFAULT_DISTRACTING.slice() },
  streak: { count: 0, last: null },
  day: { date: null, prodMs: 0, secured: false },
  session: null, last: null, lastSessionDate: null, inactiveNotified: null,
  events: [], eid: 0, notified: 0
});
async function loadState() {
  const r = await chrome.storage.local.get('ff'), d = DEFAULT_STATE(), s = r.ff || {};
  const merged = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  // Older saves used one sound checkbox. Preserve the user's choice when upgrading.
  if (s.settings && s.settings.sound === true && s.settings.muted === undefined) merged.settings.muted = false;
  delete merged.settings.sound;
  return merged;
}
const saveState = st => chrome.storage.local.set({ ff: st });
const demoItemsUnlocked = st => !!(st.settings.demo && st.settings.demoUnlocks);
function evt(st, type, text) {
  st.eid = (st.eid || 0) + 1;
  st.events = (st.events || []).concat({ id: st.eid, type, text }).slice(-8);
}

/* ---------- websites ---------- */
function hostOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; }
  catch (e) { return ''; }
}
const matches = (host, list) => list.some(d => host === d || host.endsWith('.' + d));
function classify(host, st) {
  if (!host) return 'neutral';
  const o = st.session && st.session.overrides;
  if (o) for (const h in o) if (host === h || host.endsWith('.' + h)) return o[h];
  if (matches(host, st.settings.productive)) return 'productive';
  if (matches(host, st.settings.distracting)) return 'distracting';
  return 'neutral';   // unlisted sites do nothing
}

/* ---------- health, time accounting, points, streak ---------- */
const allowedMs = s => s.plannedMs * FRACTION;
function health(s) {
  if (s.status === 'fainted') return 0;
  return Math.max(0, Math.min(100, Math.round(100 - 100 * s.distMs / allowedMs(s))));
}

function moodAlertStage(h) {
  return h <= 0 ? 4 : h <= 10 ? 3 : h <= 25 ? 2 : h <= 50 ? 1 : 0;
}

// Emits one alert only when health crosses into a worse mood band. If a clock
// jump crosses several bands, only the most urgent new state is announced.
function updateMoodAlert(st) {
  const s = st.session;
  if (!s || s.notificationsMuted) return;
  const next = moodAlertStage(health(s)), previous = s.notifyStage || 0;
  if (next <= previous) return;
  s.notifyStage = next;
  evt(st, MOOD_ALERTS[next].type, MOOD_ALERTS[next].text);
  if (next === 4) s.notificationsMuted = true;
}

// Moves the clock forward. All timing is computed from timestamps, so it survives the
// service worker sleeping. Paused/fainted time never counts.
function advance(st, now) {
  const s = st.session;
  if (!s) return;
  let real = now - s.lastTick;
  s.lastTick = now;
  if (s.status !== 'running' || real <= 0) return;
  const speed = st.settings.demo ? DEMO_SPEED : 1;
  const damageSpeed = st.settings.demo ? DEMO_DAMAGE_SPEED : 1;
  real = Math.min(real, 90000, (s.plannedMs - s.activeMs) / speed);   // 90s cap: laptop sleep must not count
  if (real <= 0) return;
  const sim = real * speed;
  s.activeMs += sim;
  if (s.cat === 'distracting') {
    const g = Math.min(real, s.graceLeft);                 // grace period uses real time
    s.graceLeft -= g;
    const room = Math.max(0, allowedMs(s) - s.distMs);
    s.distMs += Math.min(real * damageSpeed * (1 - g / real), room);
    if (s.distMs >= allowedMs(s) - 1) s.status = 'fainted';
    updateMoodAlert(st);
  } else {
    s.prodMs += sim;                                       // productive + neutral time earns points
    addDay(st, sim);
  }
  const left = s.plannedMs - s.activeMs;
  if (s.status === 'running' && !s.fiveSent && s.plannedMs >= 10 * MIN && left > 0 && left <= 5 * MIN) {
    s.fiveSent = true; evt(st, 'five', 'Five minutes left. You can do it!');
  }
}

function addDay(st, ms) {
  const t = todayStr();
  if (st.day.date !== t) st.day = { date: t, prodMs: 0, secured: false };
  st.day.prodMs += ms;
  if (!st.day.secured && st.day.prodMs >= STREAK_MIN * MIN) {   // secured on the 15th productive minute
    st.day.secured = true;
    st.streak.count = st.streak.last === shiftDay(t, -1) ? st.streak.count + 1 : 1;
    st.streak.last = t;
    st.best = Math.max(st.best, st.streak.count);
    evt(st, 'streak', 'Streak secured! You focused for 15 minutes today. \u{1F525}');
  }
}

// Awards points only when the timer finishes: base = productive minutes, bonus = base x health / 200.
function settle(st) {
  const s = st.session;
  if (!s || s.status !== 'running' || s.activeMs < s.plannedMs - 1) return;
  const base = Math.floor(s.prodMs / MIN), h = health(s), bonus = Math.round(base * h / 200);
  st.points += base + bonus; st.totalMin += base;
  st.last = { ok: true, goal: s.goal, base, bonus, health: h, total: base + bonus, rescued: s.rescued };
  st.session = null;
  evt(st, 'complete', 'Session complete! +' + (base + bonus) + ' points');
}

/* ---------- sounds ---------- */
const SOUND_IDS = ['happy', 'okay', 'sad', 'panic', 'final', 'faint', 'sleeping', 'warn', 'five', 'complete', 'streak', 'rescue', 'treat', 'start'];
// The same sound has a slightly different voice for each animal.
const ANIMAL_PITCH = { retriever: 1, shepherd: .85, corgi: 1.05, husky: .95, dalmatian: 1, pug: 1.1, tabby: 1.25, blackcat: 1.2, bunny: 1.35,
  fox: 1.15, wolf: .75, panda: .8, polarbear: .65, brownbear: .7, koala: .9, raccoon: 1.1, redpanda: 1.25, otter: 1.2, capybara: .8, pig: .95,
  cow: .6, sheep: .95, lion: .6, tiger: .7, monkey: 1.2, penguin: 1, owl: .85, chicken: 1.3, duck: 1.15, frog: 1.1 };
const EVENT_SOUND = { warn: 'warn', five: 'five', complete: 'complete', streak: 'streak', treat: 'treat', rescue: 'rescue', start: 'start',
  moodSad: 'sad', moodPanic: 'panic', moodFinal: 'final', moodFaint: 'faint' };
const MOOD_SOUND = { happy: 'happy', okay: 'okay', sad: 'sad', panic: 'panic', fainted: 'faint', sleeping: 'sleeping' };
const SOUND_PRIORITY = ['faint', 'final', 'complete', 'streak', 'rescue', 'panic', 'warn', 'sad', 'five', 'start', 'treat', 'okay', 'happy', 'sleeping'];

function moodKey(st) {
  const s = st.session;
  if (!s) return 'happy';
  if (s.status === 'fainted') return 'fainted';
  if (s.status === 'paused') return 'sleeping';
  const h = health(s);
  return h >= 76 ? 'happy' : h >= 51 ? 'okay' : h >= 26 ? 'sad' : 'panic';
}

// Play only the most important simultaneous event. Completion may be followed by a streak reward.
// Entering/leaving pause is intentionally silent so routine controls do not become distracting.
function planSounds(st, freshEvents, prevMood) {
  const found = new Set();
  const alertsMuted = !!(st.session && st.session.notificationsMuted);
  for (const e of freshEvents) {
    if (alertsMuted && ['warn', 'moodSad', 'moodPanic', 'moodFinal'].includes(e.type)) continue;
    if (EVENT_SOUND[e.type]) found.add(EVENT_SOUND[e.type]);
  }
  const mood = moodKey(st);
  if (st.session && prevMood && mood !== prevMood && mood !== 'sleeping' && prevMood !== 'sleeping') found.add(MOOD_SOUND[mood]);
  const ordered = SOUND_PRIORITY.filter(id => found.has(id));
  const plan = ordered.slice(0, 1);
  if (ordered[0] === 'complete' && found.has('streak')) plan.push('streak');
  return plan;
}
