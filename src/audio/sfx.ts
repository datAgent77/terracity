/**
 * Procedurally synthesised sound effects (WebAudio, no audio files, so no
 * licensing). Short and soft by design; respects the `soundOn` preference.
 * The AudioContext is created lazily and resumed on the first user gesture.
 */
import { soundOn } from '../ui/accessibility.js';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (!soundOn.peek()) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // no WebAudio (e.g. some test environments)
  }
}

/** Resume audio on the first gesture (autoplay policy). */
export function unlockAudio(): void {
  const resume = () => audio();
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, resume, { once: true });
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.5, endFreq?: number) {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, from: number, to: number, gain = 0.3) {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  /** UI button press. */
  click: () => tone(1200, 0, 0.05, 'triangle', 0.18),
  /** Structure set down on a valid tile: wooden "tok". */
  place: () => {
    tone(260, 0, 0.12, 'sine', 0.5, 140);
    noise(0, 0.04, 2500, 1200, 0.12);
  },
  /** Blocked / refused action. */
  reject: () => {
    tone(150, 0, 0.09, 'square', 0.12);
    tone(130, 0.11, 0.12, 'square', 0.12);
  },
  remove: () => tone(520, 0, 0.16, 'triangle', 0.25, 200),
  undo: () => tone(700, 0, 0.07, 'triangle', 0.2, 520),
  /** Homes newly connected by road. */
  connect: () => {
    tone(880, 0.05, 0.12, 'sine', 0.22);
    tone(1320, 0.12, 0.18, 'sine', 0.18);
  },
  /** Time travel whoosh; pitch hints at the direction. */
  timeTravel: (forward: boolean) => {
    noise(0, 0.6, forward ? 400 : 3000, forward ? 3000 : 400, 0.25);
    tone(forward ? 520 : 780, 0.35, 0.3, 'sine', 0.15, forward ? 780 : 520);
  },
  saved: () => {
    tone(660, 0, 0.1, 'sine', 0.25);
    tone(990, 0.09, 0.16, 'sine', 0.22);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'sine', 0.3)),
  lose: () => {
    tone(392, 0, 0.3, 'triangle', 0.25);
    tone(311, 0.28, 0.45, 'triangle', 0.25);
  },
};
