// Synthesized effects: no recorded audio files or third-party sound assets.
const SOUND_NOTES = {
  happy:    [{ f: 523.25, t: 0, d: .18, type: 'triangle' }, { f: 659.25, t: .09, d: .18, type: 'triangle' }, { f: 783.99, t: .18, d: .34, type: 'triangle' }],
  okay:     [{ f: 440, t: 0, d: .16 }, { f: 494, t: .12, d: .24, v: .4 }],
  sad:      [{ f: 392, to: 262, t: 0, d: .75, type: 'triangle', v: .45 }, { f: 330, to: 220, t: .25, d: .75, v: .3 }],
  panic:    Array.from({ length: 6 }, (_, i) => ({ f: i % 2 ? 740 : 880, t: i * .08, d: .07, type: 'square', v: .22 })),
  final:    Array.from({ length: 3 }, (_, i) => ({ f: 600, to: 1100, t: i * .28, d: .26, type: 'sawtooth', v: .26 })),
  faint:    [{ f: 700, to: 70, t: 0, d: .95, v: .5 }, { noise: true, t: .9, d: .28, v: .55, lp: 280 }],
  sleeping: [{ f: 392, t: 0, d: .55, v: .25 }, { f: 330, t: .28, d: .55, v: .25 }, { f: 262, t: .56, d: .85, v: .25 }],
  warn:     [{ f: 466, t: 0, d: .14, type: 'triangle', v: .45 }, { f: 370, t: .13, d: .24, type: 'triangle', v: .45 }],
  five:     [0, .5].flatMap(t => [{ f: 880, t, d: .7, v: .4 }, { f: 1760, t, d: .4, v: .15 }, { f: 2637, t, d: .25, v: .08 }]),
  complete: [{ f: 523.25, t: 0, d: .2, type: 'triangle' }, { f: 659.25, t: .12, d: .2, type: 'triangle' }, { f: 783.99, t: .24, d: .2, type: 'triangle' },
             { f: 1046.5, t: .36, d: .8, type: 'triangle' }, { f: 1318.5, t: .4, d: .6, v: .2 }],
  streak:   [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5].map((f, i) => ({ f, t: i * .07, d: .22, v: .3 })),
  rescue:   [{ f: 200, to: 800, t: 0, d: .35, type: 'triangle', v: .4 }, { f: 784, t: .33, d: .3 }, { f: 1047, t: .45, d: .5, v: .4 }],
  treat:    [...[0, .09, .18].map(t => ({ f: 260, to: 140, t, d: .07, type: 'square', v: .28 })), { f: 880, t: .34, d: .22, type: 'triangle', v: .3 }],
  start:    [{ f: 523.25, to: 783.99, t: 0, d: .14, type: 'triangle', v: .4 }, { f: 1046.5, t: .14, d: .22, v: .3 }]
};
const SOUND_GAP = 1;

function soundNote(ctx, dest, start, note, pitch) {
  const when = start + note.t, gain = ctx.createGain();
  gain.gain.setValueAtTime(.0001, when);
  gain.gain.exponentialRampToValueAtTime(note.v == null ? .5 : note.v, when + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, when + note.d);
  if (note.noise) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * note.d));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = note.lp || 300;
    source.connect(filter); filter.connect(gain); gain.connect(dest); source.start(when); source.stop(when + note.d + .03);
    return;
  }
  const oscillator = ctx.createOscillator();
  oscillator.type = note.type || 'sine';
  oscillator.frequency.setValueAtTime(note.f * pitch, when);
  if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to * pitch, when + note.d);
  oscillator.connect(gain); gain.connect(dest); oscillator.start(when); oscillator.stop(when + note.d + .03);
}

function playSoundSequence(ctx, ids, volume, pitch) {
  if (!(volume > 0)) return 0;
  const master = ctx.createGain();
  master.gain.value = Math.pow(Math.min(100, volume) / 100, 2);
  master.connect(ctx.destination);
  const voice = Math.max(.5, Math.min(1.6, pitch || 1));
  let start = ctx.currentTime + .03, played = 0;
  for (const id of ids) {
    const notes = SOUND_NOTES[id];
    if (!notes) continue;
    notes.forEach(note => soundNote(ctx, master, start, note, voice));
    start += SOUND_GAP; played++;
  }
  return played;
}
