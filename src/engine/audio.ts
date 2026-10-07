// Code-generated sound effects on the Web Audio API.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Shared audio graph for other synth modules (music, ambience). */
export function audioGraph() {
  return ctx && master && noiseBuffer ? { ctx, master, noiseBuffer } : null;
}

interface ToneOpts {
  type: OscillatorType;
  from: number;
  to: number;
  dur: number;
  vol?: number;
  delay?: number;
}

function tone({ type, from, to, dur, vol = 0.5, delay = 0 }: ToneOpts) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, delay = 0) {
  if (!ctx || !master || !noiseBuffer) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(60, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  buster() {
    tone({ type: 'square', from: 1400, to: 300, dur: 0.12, vol: 0.18 });
    tone({ type: 'sawtooth', from: 700, to: 200, dur: 0.1, vol: 0.08 });
  },
  jump() {
    tone({ type: 'square', from: 220, to: 660, dur: 0.14, vol: 0.12 });
  },
  land() {
    noise(0.08, 0.25, 900);
  },
  kick() {
    noise(0.12, 0.4, 2500);
    tone({ type: 'sine', from: 160, to: 50, dur: 0.12, vol: 0.4 });
  },
  canHit() {
    tone({ type: 'triangle', from: 1900, to: 1300, dur: 0.18, vol: 0.2 });
    tone({ type: 'triangle', from: 2700, to: 2100, dur: 0.12, vol: 0.12 });
    noise(0.05, 0.2, 5000);
  },
  canBounce(strength: number) {
    const v = Math.min(strength / 8, 1) * 0.15;
    tone({ type: 'triangle', from: 1700 + Math.random() * 400, to: 1200, dur: 0.08, vol: v });
  },
  hit() {
    noise(0.15, 0.35, 3000);
    tone({ type: 'square', from: 500, to: 120, dur: 0.15, vol: 0.12 });
  },
  swing() {
    noise(0.18, 0.3, 1200);
    tone({ type: 'sine', from: 300, to: 90, dur: 0.16, vol: 0.3 });
  },
  talk() {
    tone({ type: 'square', from: 660, to: 660, dur: 0.03, vol: 0.06 });
  },
  lockOn() {
    tone({ type: 'square', from: 880, to: 880, dur: 0.05, vol: 0.1 });
    tone({ type: 'square', from: 1320, to: 1320, dur: 0.06, vol: 0.1, delay: 0.06 });
  },
  explode() {
    noise(0.5, 0.5, 1800);
    tone({ type: 'sine', from: 120, to: 30, dur: 0.45, vol: 0.5 });
  },
  enemyShot() {
    tone({ type: 'sawtooth', from: 380, to: 160, dur: 0.18, vol: 0.12 });
  },
  hurt() {
    tone({ type: 'square', from: 900, to: 180, dur: 0.22, vol: 0.18 });
    noise(0.1, 0.25, 2000);
  },
  zenny() {
    tone({ type: 'triangle', from: 1568, to: 1568, dur: 0.06, vol: 0.12 });
    tone({ type: 'triangle', from: 2093, to: 2093, dur: 0.12, vol: 0.12, delay: 0.05 });
  },
  heal() {
    for (let i = 0; i < 4; i++) tone({ type: 'square', from: 523 * Math.pow(1.26, i), to: 523 * Math.pow(1.26, i), dur: 0.06, vol: 0.08, delay: i * 0.05 });
  },
  stomp() {
    noise(0.6, 0.6, 700);
    tone({ type: 'sine', from: 90, to: 25, dur: 0.6, vol: 0.7 });
  },
  roar() {
    tone({ type: 'sawtooth', from: 140, to: 60, dur: 1.4, vol: 0.25 });
    tone({ type: 'sawtooth', from: 147, to: 62, dur: 1.4, vol: 0.2 });
    noise(1.2, 0.25, 900);
  },
  charge() {
    tone({ type: 'sawtooth', from: 200, to: 1200, dur: 0.9, vol: 0.12 });
  },
  laser() {
    tone({ type: 'square', from: 1800, to: 1500, dur: 0.12, vol: 0.07 });
    noise(0.12, 0.12, 6000);
  },
  missile() {
    noise(0.3, 0.25, 4000);
    tone({ type: 'sawtooth', from: 300, to: 900, dur: 0.25, vol: 0.08 });
  },
  rumble() {
    noise(2.2, 0.45, 400);
    tone({ type: 'sine', from: 50, to: 35, dur: 2.2, vol: 0.4 });
  },
  chest() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: i === notes.length - 1 ? 0.5 : 0.1, vol: 0.1, delay: i * 0.1 }));
  },
  victory() {
    const notes = [392, 523, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: i === notes.length - 1 ? 0.9 : 0.14, vol: 0.12, delay: i * 0.14 }));
  },
};
