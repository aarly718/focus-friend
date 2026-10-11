// Service workers cannot play Web Audio, so background.js sends sound requests here.
let audioCtx;
chrome.runtime.onMessage.addListener(message => {
  if (!message || message.target !== 'offscreen' || message.type !== 'sound') return;
  audioCtx = audioCtx || new AudioContext();
  const play = () => playSoundSequence(audioCtx, message.sounds || [], message.volume, message.pitch);
  if (audioCtx.state === 'suspended') audioCtx.resume().then(play).catch(() => {});
  else play();
});
