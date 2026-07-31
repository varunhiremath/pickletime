// Tiny WebAudio chimes. No audio files — a couple of oscillators keep the bundle
// small and work offline in the APK.
//
// Every call is a no-op when sound is off in settings. iOS suspends the audio
// context until a user gesture, so it is resumed on play.

import useSettingsStore from '../store/settingsStore.js';

let ctx = null;

function context() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume?.();
  return ctx;
}

function tone(freq, start, duration, { gain = 0.05, type = 'sine' } = {}) {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Short attack/release so it reads as a chime rather than a click.
  amp.gain.setValueAtTime(0, ac.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

const enabled = () => useSettingsStore.getState().sound;

/** A single soft tick — score increment. */
export function playTick() {
  if (!enabled()) return;
  tone(880, 0, 0.06, { gain: 0.025 });
}

/** Two-note confirmation — a game's score was submitted. */
export function playChime() {
  if (!enabled()) return;
  tone(659.25, 0, 0.18);
  tone(987.77, 0.09, 0.26);
}

/** Rising arpeggio — a session was completed, or someone took top spot. */
export function playFanfare() {
  if (!enabled()) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.075, 0.3, { gain: 0.05 }));
}

/** Low blip — something failed or was rejected. */
export function playError() {
  if (!enabled()) return;
  tone(180, 0, 0.16, { gain: 0.04, type: 'triangle' });
}
