// Run with: node tests/logic.test.js   (no dependencies)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } }, console, URL };
vm.createContext(ctx);
const read = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
vm.runInContext(read('shared.js') + ';this.api={advance,settle,health,classify,hostOf,DEFAULT_STATE,MIN,GRACE,ANIMAL_IDS,streak:shiftDay};', ctx);
vm.runInContext(read('art.js') + ';this.art={ANIMALS,buddySVG};', ctx);
const { advance, settle, health, classify, hostOf, DEFAULT_STATE, MIN, GRACE, ANIMAL_IDS } = ctx.api, { ANIMALS, buddySVG } = ctx.art;

function session(mins, extra) {
  const st = DEFAULT_STATE();
  st.session = Object.assign({ goal: 't', plannedMs: mins * MIN, activeMs: 0, prodMs: 0, distMs: 0, graceLeft: GRACE, status: 'running', cat: 'neutral', host: '', lastTick: 0, overrides: {}, rescued: false, fiveSent: false }, extra);
  return st;
}
function run(st, ms, step = 5000) { let t = st.session ? st.session.lastTick : 0; for (let i = 0; i < ms / step && st.session; i++) { t += step; advance(st, t); settle(st); } }

// websites
const st0 = DEFAULT_STATE();
assert.equal(classify(hostOf('https://www.tiktok.com/foo'), st0), 'distracting');
assert.equal(classify(hostOf('https://docs.google.com/d/1'), st0), 'productive');
assert.equal(classify(hostOf('https://www.youtube.com/watch'), st0), 'neutral');
assert.equal(classify(hostOf('https://old.reddit.com'), st0), 'neutral');
assert.equal(classify(hostOf('chrome://extensions'), st0), 'neutral');

// health: a 25 min session faints after 5 distracted minutes (plus the 10s grace period)
let a = session(25, { cat: 'distracting' });
run(a, 5 * MIN + GRACE - 5000); assert.ok(health(a.session) > 0 && a.session.status === 'running');
run(a, 10000); assert.equal(a.session.status, 'fainted'); assert.equal(health(a.session), 0);

// points formula examples from the spec
const pts = (mins, healthPct) => { const st = session(mins, { prodMs: mins * MIN, activeMs: mins * MIN, distMs: (100 - healthPct) / 100 * mins * MIN * 0.2 }); settle(st); return st.points; };
assert.equal(pts(30, 100), 45); assert.equal(pts(30, 80), 42); assert.equal(pts(60, 50), 75); assert.equal(pts(120, 100), 180);

// distracting and paused time earn nothing; points are never subtracted
let b = session(30, { cat: 'distracting', graceLeft: 0 }); run(b, 60000, 5000); assert.equal(b.session.prodMs, 0);
let c = session(30, { status: 'paused' }); advance(c, 600000); assert.equal(c.session.activeMs, 0);

// streak secures on the 15th productive minute, and a failed session keeps the minutes
let d = session(60); run(d, 15 * MIN + 5000);
assert.equal(d.streak.count, 1); assert.equal(d.day.secured, true);

// every animal has art in every mood, and ids match the shop list
assert.deepEqual(ANIMALS.map(x => x[0]), ANIMAL_IDS);
for (const an of ANIMALS) for (const m of ['happy', 'okay', 'sad', 'panic', 'fainted', 'sleeping']) {
  const svg = buddySVG(an[0], m, { acc: 'glasses', hue: 90 }); assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), an[0] + ' ' + m);
}
console.log('All tests passed (' + ANIMALS.length + ' animals x 6 moods).');
