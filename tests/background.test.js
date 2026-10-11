// Run with: node tests/background.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');

let saved = null;
const notifications = [];
const soundMessages = [];
let offscreenOpen = false;
const chrome = {
  storage: { local: {
    get: async () => ({ ff: saved }),
    set: async value => { if (value.ff) saved = value.ff; }
  } },
  tabs: { query: async () => [], onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
  windows: { onFocusChanged: { addListener() {} } },
  alarms: { create() {}, onAlarm: { addListener() {} } },
  notifications: { create: async (id, options) => notifications.push({ id, ...options }) },
  runtime: {
    getURL: path => 'chrome-extension://test/' + path,
    getContexts: async () => offscreenOpen ? [{}] : [],
    sendMessage: async message => { if (message.target === 'offscreen') soundMessages.push(message); },
    onMessage: { addListener() {} }, onConnect: { addListener() {} },
    onStartup: { addListener() {} }, onInstalled: { addListener() {} }
  },
  offscreen: { createDocument: async () => { offscreenOpen = true; } },
  sidePanel: { open: async () => {}, setPanelBehavior: async () => {} }
};
const ctx = { chrome, console, URL, Date, setTimeout, clearTimeout };
vm.createContext(ctx);
const read = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
vm.runInContext(read('shared.js') + '\n' + read('background.js').replace("importScripts('shared.js');", '') + '\nthis.api={act,commit,evt,DEFAULT_STATE,MIN,allowedMs};', ctx);
const { act, commit, evt, DEFAULT_STATE, MIN, allowedMs } = ctx.api;

(async () => {
  // Entering a distracting site creates a fresh desktop alert; timer events stay in-app.
  saved = DEFAULT_STATE();
  for (const type of ['five', 'complete']) evt(saved, type, type);
  await commit(saved);
  assert.equal(notifications.length, 0);
  evt(saved, 'warn', 'Your buddy is getting distracted!');
  await commit(saved);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, '');
  assert.equal(notifications[0].silent, true);
  evt(saved, 'moodSad', 'Your buddy is sad. Stay focused!');
  await commit(saved);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].id, '');
  assert.equal(notifications[1].message, 'Your buddy is sad. Stay focused!');

  // A fainted session suppresses later warnings until it is rescued.
  saved.session = { notificationsMuted: true };
  evt(saved, 'warn', 'muted');
  await commit(saved);
  assert.equal(notifications.length, 2);
  evt(saved, 'moodFaint', 'Your buddy fainted. Rescue it or end the session.');
  await commit(saved);
  assert.equal(notifications.length, 3);
  assert.equal(notifications[2].message, 'Your buddy fainted. Rescue it or end the session.');

  // Custom audio is muted by default, then uses the offscreen player at the saved volume.
  saved = DEFAULT_STATE();
  await act({ type: 'audio', muted: false, preview: true });
  assert.equal(saved.settings.muted, false);
  assert.equal(soundMessages.at(-1).sounds[0], 'happy');
  assert.equal(soundMessages.at(-1).volume, 60);
  await act({ type: 'audio', volume: 35 });
  assert.equal(saved.settings.volume, 35);

  // Demo rescue revives for free and re-enables future mood alerts.
  saved = DEFAULT_STATE();
  saved.settings.demo = true;
  saved.session = { goal: 't', plannedMs: 15 * MIN, activeMs: 0, prodMs: 0, distMs: 3 * MIN,
    graceLeft: 0, status: 'fainted', cat: 'distracting', host: '', lastTick: Date.now(), overrides: {},
    rescued: false, fiveSent: false, notifyStage: 4, notificationsMuted: true };
  assert.equal(saved.session.distMs, allowedMs(saved.session));
  await act({ type: 'rescue' });
  assert.equal(saved.session.status, 'running');
  assert.equal(saved.session.notificationsMuted, false);
  assert.equal(saved.points, 0);

  // Healing above a band rearms that threshold for a later downward crossing.
  saved = DEFAULT_STATE(); saved.points = 10;
  saved.session = { goal: 't', plannedMs: 25 * MIN, activeMs: 0, prodMs: 0, distMs: 2.5 * MIN,
    graceLeft: 0, status: 'running', cat: 'neutral', host: '', lastTick: Date.now(), overrides: {},
    rescued: false, fiveSent: false, notifyStage: 1, notificationsMuted: false };
  await act({ type: 'treat' });
  assert.equal(saved.session.notifyStage, 0);
  assert.equal(saved.points, 0);

  // Judge preparation is persistent and leaves one focused minute to earn the streak.
  saved = DEFAULT_STATE(); saved.settings.demo = true;
  await act({ type: 'demoPrep' });
  assert.equal(saved.points, 100);
  assert.equal(saved.day.prodMs, 14 * MIN);
  console.log('Background lifecycle tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
