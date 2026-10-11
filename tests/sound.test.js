// Run with: node tests/sound.test.js   (no dependencies)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let stored = {};
const ctx = { URL, console, chrome: { storage: { local: { get: async () => stored, set: async () => {} } } } };
vm.createContext(ctx);
const read = file => fs.readFileSync(__dirname + '/../' + file, 'utf8');
vm.runInContext(read('shared.js') + ';this.api={moodKey,planSounds,loadState,SOUND_IDS,ANIMAL_IDS,ANIMAL_PITCH,DEFAULT_STATE,MIN,GRACE};', ctx);
vm.runInContext(read('sound.js') + ';this.snd={SOUND_NOTES,playSoundSequence};', ctx);
const { moodKey, planSounds, loadState, SOUND_IDS, ANIMAL_IDS, ANIMAL_PITCH, DEFAULT_STATE, MIN, GRACE } = ctx.api;
const { SOUND_NOTES, playSoundSequence } = ctx.snd;

function withHealth(health, status) {
  const st = DEFAULT_STATE();
  st.session = { goal: 't', plannedMs: 100 * MIN, activeMs: 0, prodMs: 0, distMs: (100 - health) / 100 * 20 * MIN,
    graceLeft: GRACE, status: status || 'running', cat: 'neutral', overrides: {} };
  return st;
}
const events = (...types) => types.map((type, index) => ({ id: index + 1, type, text: '' }));

assert.equal(moodKey(withHealth(100)), 'happy');
assert.equal(moodKey(withHealth(60)), 'okay');
assert.equal(moodKey(withHealth(30)), 'sad');
assert.equal(moodKey(withHealth(10)), 'panic');
assert.equal(moodKey(withHealth(100, 'paused')), 'sleeping');
assert.equal(moodKey(withHealth(0, 'fainted')), 'fainted');

assert.deepEqual(planSounds(withHealth(60), [], 'happy'), ['okay']);
assert.deepEqual(planSounds(withHealth(30), events('moodSad'), 'okay'), ['sad']);
assert.deepEqual(planSounds(withHealth(100), events('warn'), 'happy'), ['warn']);
assert.deepEqual(planSounds(withHealth(0, 'fainted'), events('moodFaint', 'warn'), 'panic'), ['faint']);
assert.deepEqual(planSounds(withHealth(5), events('moodPanic', 'moodFinal'), 'sad'), ['final']);
assert.deepEqual(planSounds(DEFAULT_STATE(), events('complete', 'streak'), 'happy'), ['complete', 'streak']);
assert.deepEqual(planSounds(DEFAULT_STATE(), events('complete'), 'okay'), ['complete']);
assert.deepEqual(planSounds(DEFAULT_STATE(), [], 'sad'), []);
assert.deepEqual(planSounds(withHealth(100, 'paused'), [], 'happy'), []); // pause is intentionally quiet
assert.deepEqual(planSounds(withHealth(100), [], 'sleeping'), []);       // resume is intentionally quiet
assert.deepEqual(planSounds(withHealth(60), events('treat'), 'sad'), ['treat']);
assert.deepEqual(planSounds(withHealth(100), events('rescue'), 'fainted'), ['rescue']);
{
  const fainted = withHealth(0, 'fainted');
  fainted.session.notificationsMuted = true;
  assert.deepEqual(planSounds(fainted, events('warn'), 'fainted'), []);
  assert.deepEqual(planSounds(fainted, events('moodFaint'), 'panic'), ['faint']);
}

for (const id of SOUND_IDS) assert.ok(SOUND_NOTES[id] && SOUND_NOTES[id].length, 'missing sound ' + id);
for (const id of ANIMAL_IDS) assert.ok(ANIMAL_PITCH[id] > .5 && ANIMAL_PITCH[id] < 1.6, 'pitch ' + id);

function fakeAudioContext() {
  const made = { oscillators: 0, noise: 0 };
  const param = () => ({ value: 1, setValueAtTime(value) { assert.ok(value > 0 || value === 1); }, exponentialRampToValueAtTime(value) { assert.ok(value > 0); } });
  return { made, currentTime: 0, sampleRate: 44100, destination: {},
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => { made.oscillators++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => { made.noise++; return { connect() {}, start() {}, stop() {} }; },
    createBiquadFilter: () => ({ frequency: { value: 0 }, connect() {} }) };
}
for (const id of SOUND_IDS) {
  const audio = fakeAudioContext();
  assert.equal(playSoundSequence(audio, [id], 60, 1), 1);
  assert.ok(audio.made.oscillators + audio.made.noise > 0, id);
}
{
  const audio = fakeAudioContext();
  assert.equal(playSoundSequence(audio, ['happy'], 0, 1), 0);
  assert.equal(audio.made.oscillators, 0);
}

(async () => {
  stored = {};
  let state = await loadState();
  assert.equal(state.settings.muted, true);
  assert.equal(state.settings.volume, 60);
  stored = { ff: { settings: { sound: true } } };
  state = await loadState();
  assert.equal(state.settings.muted, false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings, 'sound'), false);
  console.log('Sound tests passed (' + SOUND_IDS.length + ' sounds, ' + ANIMAL_IDS.length + ' animal pitches).');
})().catch(error => { console.error(error); process.exitCode = 1; });
