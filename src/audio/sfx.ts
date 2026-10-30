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
  /** Entering the street: a soft descending whoosh and a warm chime. */
  enter: () => {
    noise(0, 0.7, 3200, 500, 0.22);
    tone(392, 0.45, 0.6, 'sine', 0.18);
    tone(587, 0.55, 0.7, 'sine', 0.14);
  },
  /** Back to the tabletop: the reverse. */
  exit: () => {
    noise(0, 0.6, 500, 3200, 0.2);
    tone(587, 0.35, 0.4, 'sine', 0.14, 392);
  },
  /** Teleport between viewpoints / switching plans. */
  teleport: () => noise(0, 0.28, 1800, 900, 0.12),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'sine', 0.3)),
  lose: () => {
    tone(392, 0, 0.3, 'triangle', 0.25);
    tone(311, 0.28, 0.45, 'triangle', 0.25);
  },
};

/**
 * Street ambience (procedural, loops while visiting): a wind bed; a low, muffled
 * city hum that grows with smog (`haze`); bird chirps from random directions
 * (stereo-panned) whose rate follows the number of birds (`greening`).
 */
export const streetAmbience = (() => {
  let wind: AudioBufferSourceNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let hum: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let birds = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const chirp = () => {
    const a = audio();
    if (!a || !master || birds <= 0) return;
    const pan = a.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(master);
    const t0 = a.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const osc = a.createOscillator();
      const g = a.createGain();
      const f = 2600 + Math.random() * 1400;
      const t = t0 + i * 0.11;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(pan);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (birds <= 0) return;
    const wait = 2600 / Math.max(1, birds) + Math.random() * 1400;
    timer = setTimeout(() => {
      chirp();
      schedule();
    }, wait);
  };

  return {
    start(): void {
      const a = audio();
      if (!a || !master || wind) return;
      const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown-ish noise
        d[i] = last * 3.5;
      }
      wind = a.createBufferSource();
      wind.buffer = buf;
      wind.loop = true;
      windFilter = a.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 700;
      windGain = a.createGain();
      windGain.gain.setValueAtTime(0.0001, a.currentTime);
      windGain.gain.exponentialRampToValueAtTime(0.12, a.currentTime + 1.2);
      wind.connect(windFilter).connect(windGain).connect(master);
      wind.start();
      hum = a.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 62;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      humGain = a.createGain();
      humGain.gain.value = 0.0001;
      hum.connect(lp).connect(humGain).connect(master);
      hum.start();
    },
    set(opts: { birds: number; haze: number }): void {
      const a = audio();
      birds = opts.birds;
      schedule();
      if (!a || !windFilter || !humGain) return;
      windFilter.frequency.setTargetAtTime(700 - 350 * opts.haze, a.currentTime, 0.4);
      humGain.gain.setTargetAtTime(0.0001 + 0.05 * opts.haze, a.currentTime, 0.4);
    },
    stop(): void {
      birds = 0;
      schedule();
      const a = ctx;
      if (a && windGain) windGain.gain.setTargetAtTime(0.0001, a.currentTime, 0.25);
      if (a && humGain) humGain.gain.setTargetAtTime(0.0001, a.currentTime, 0.25);
      const w = wind;
      const h = hum;
      setTimeout(() => {
        try {
          w?.stop();
          h?.stop();
        } catch {
          /* already stopped */
        }
      }, 1200);
      wind = null;
      hum = null;
      windGain = null;
      windFilter = null;
      humGain = null;
    },
  };
})();
