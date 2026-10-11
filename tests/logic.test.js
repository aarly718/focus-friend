// Run with: node tests/logic.test.js   (no dependencies)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } }, console, URL };
vm.createContext(ctx);
const read = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
vm.runInContext(read('shared.js') + ';this.api={advance,settle,health,classify,hostOf,DEFAULT_STATE,MIN,GRACE,ANIMAL_IDS,ITEMS,demoItemsUnlocked,moodAlertStage,updateMoodAlert,streak:shiftDay};', ctx);
vm.runInContext(read('art.js') + ';this.art={ANIMALS,SLEEP_SHEETS,buddySVG,auraHTML};', ctx);
const { advance, settle, health, classify, hostOf, DEFAULT_STATE, MIN, GRACE, ANIMAL_IDS, ITEMS, demoItemsUnlocked, moodAlertStage, updateMoodAlert } = ctx.api, { ANIMALS, SLEEP_SHEETS, buddySVG, auraHTML } = ctx.art;

function session(mins, extra) {
  const st = DEFAULT_STATE();
  st.session = Object.assign({ goal: 't', plannedMs: mins * MIN, activeMs: 0, prodMs: 0, distMs: 0, graceLeft: GRACE, status: 'running', cat: 'neutral', host: '', lastTick: 0, overrides: {}, rescued: false, fiveSent: false, notifyStage: 0, notificationsMuted: false }, extra);
  return st;
}
function run(st, ms, step = 5000) { let t = st.session ? st.session.lastTick : 0; for (let i = 0; i < ms / step && st.session; i++) { t += step; advance(st, t); settle(st); } }

// websites
const st0 = DEFAULT_STATE();
assert.equal(demoItemsUnlocked(st0), false);
st0.settings.demo = true; st0.settings.demoUnlocks = true; assert.equal(demoItemsUnlocked(st0), true);
assert.equal(classify(hostOf('https://www.tiktok.com/foo'), st0), 'distracting');
assert.equal(classify(hostOf('https://docs.google.com/d/1'), st0), 'productive');
assert.equal(classify(hostOf('https://www.youtube.com/watch'), st0), 'neutral');
assert.equal(classify(hostOf('https://old.reddit.com'), st0), 'neutral');
assert.equal(classify(hostOf('chrome://extensions'), st0), 'neutral');

// health: a 25 min session faints after 5 distracted minutes (plus the 10s grace period)
let a = session(25, { cat: 'distracting' });
run(a, 5 * MIN + GRACE - 5000); assert.ok(health(a.session) > 0 && a.session.status === 'running');
run(a, 10000); assert.equal(a.session.status, 'fainted'); assert.equal(health(a.session), 0);
assert.equal(a.events.at(-1).type, 'moodFaint');
assert.equal(a.events.at(-1).text, 'Your buddy fainted. Rescue it or end the session.');
assert.equal(a.session.notificationsMuted, true);

// notifications happen once when crossing each mood threshold, not on every tick
let alerts = session(25);
for (const [pct, type] of [[75, 'moodOkay'], [50, 'moodSad'], [25, 'moodPanic'], [10, 'moodFinal']]) {
  alerts.session.distMs = alerts.session.plannedMs * .2 * (1 - pct / 100);
  updateMoodAlert(alerts);
  assert.equal(alerts.events.at(-1).type, type);
  const count = alerts.events.length;
  updateMoodAlert(alerts); assert.equal(alerts.events.length, count);
}
assert.deepEqual([76, 75, 50, 25, 10, 0].map(moodAlertStage), [0, 1, 2, 3, 4, 5]);

// points formula examples from the spec
const pts = (mins, healthPct) => { const st = session(mins, { prodMs: mins * MIN, activeMs: mins * MIN, distMs: (100 - healthPct) / 100 * mins * MIN * 0.2 }); settle(st); return st.points; };
assert.equal(pts(30, 100), 45); assert.equal(pts(30, 80), 42); assert.equal(pts(60, 50), 75); assert.equal(pts(120, 100), 180);

// distracting and paused time earn nothing; points are never subtracted
let b = session(30, { cat: 'distracting', graceLeft: 0 }); run(b, 60000, 5000); assert.equal(b.session.prodMs, 0);
let c = session(30, { status: 'paused' }); advance(c, 600000); assert.equal(c.session.activeMs, 0);

// Demo countdown is 30x, but health drains at 10x so notifications remain readable.
let demoDamage = session(15, { cat: 'distracting' }); demoDamage.settings.demo = true;
run(demoDamage, 11000, 1000);
assert.equal(demoDamage.session.activeMs, 11 * 30 * 1000);
assert.equal(demoDamage.session.distMs, 10 * 1000);

// streak secures on the 15th productive minute, and a failed session keeps the minutes
let d = session(60); run(d, 15 * MIN + 5000);
assert.equal(d.streak.count, 1); assert.equal(d.day.secured, true);

// every animal maps to approved bitmap art in every mood, and ids match the shop list
assert.deepEqual(ANIMALS.map(x => x[0]), ANIMAL_IDS);
for (const an of ANIMALS) for (const m of ['happy', 'okay', 'sad', 'panic', 'fainted', 'sleeping']) {
  assert.ok(an[5] && Number.isFinite(an[5].t) && Number.isFinite(an[5].e), an[0] + ' accessory anchors');
  for (const opt of [{}, ...ITEMS.filter(i => i.type === 'acc').map(i => ({ acc: i.id })), ...ITEMS.filter(i => i.type === 'color').map(i => ({ hue: i.hue }))]) {
    const art = buddySVG(an[0], m, opt);
    assert.ok(art.startsWith('<span class="buddy-art') && art.endsWith('</span>'), an[0] + ' ' + m);
    assert.ok(art.includes('assets/pets/') && art.includes('buddy-sheet'), an[0] + ' approved asset');
    assert.ok(!art.includes('NaN') && !art.includes('undefined'), an[0] + ' valid accessory geometry');
  }
  const resting = buddySVG(an[0], m === 'sleeping' ? 'okay' : m, { sleeping: true });
  assert.ok(resting.includes('is-sleeping') && resting.includes('assets/pets/sleeping-'), an[0] + ' dedicated sleeping artwork');
}
assert.deepEqual(Object.keys(SLEEP_SHEETS).sort(), ['birds', 'dogs', 'farm', 'forest', 'small', 'woodland']);
for (const sheet of Object.values(SLEEP_SHEETS)) {
  assert.ok(fs.existsSync(__dirname + '/../' + sheet.file), sheet.file + ' exists');
}
assert.ok(auraHTML('happy').includes('heart'));
assert.equal(auraHTML('okay'), '');
assert.ok(auraHTML('sad').includes('drop'));
assert.ok(auraHTML('panic').includes('alert'));
assert.ok(auraHTML('fainted').includes('faint-star'));
console.log('All tests passed (' + ANIMALS.length + ' animals x 6 moods).');
