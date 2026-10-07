import { audioGraph } from './audio';

/** Outdoor ambience: a soft wind bed with the occasional bird chirp. */
export class Ambience {
  private gain: GainNode | null = null;
  private nextChirp = 0;
  private level = 0;

  /** @param level 0..1 how strongly the ambience should play right now */
  update(level: number) {
    const graph = audioGraph();
    if (!graph) return;
    const { ctx, master, noiseBuffer } = graph;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(master);
      const wind = ctx.createBufferSource();
      wind.buffer = noiseBuffer;
      wind.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      // Slow gusts sweep the filter.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 250;
      lfo.connect(lfoGain).connect(lp.frequency);
      const windGain = ctx.createGain();
      windGain.gain.value = 0.18;
      wind.connect(lp).connect(windGain).connect(this.gain);
      wind.start();
      lfo.start();
    }
    if (Math.abs(level - this.level) > 0.01) {
      this.level = level;
      this.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    }
    if (level > 0.1 && ctx.currentTime > this.nextChirp) {
      this.chirp(ctx, this.gain);
      this.nextChirp = ctx.currentTime + 2 + Math.random() * 5;
    }
  }

  private chirp(ctx: AudioContext, out: AudioNode) {
    const base = 2400 + Math.random() * 1600;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.4, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
}
