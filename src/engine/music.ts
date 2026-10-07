// A tiny step sequencer that plays songs written as note strings.
//
// Song tracks are whitespace-separated tokens, one per step:
//   "C5"       play a note        "F4+A4+C5"  play a chord
//   "-"        hold previous note "."         rest
//   drums use "k" (kick), "s" (snare), "h" (hat), combinable as "k+h"
// "|" bar lines are ignored and only there for readability.

import { audioGraph } from './audio';

export type Instrument = 'lead' | 'accordion' | 'pluck' | 'bass' | 'pad' | 'drums';

export interface Track {
  instrument: Instrument;
  volume: number;
  pattern: string;
}

export interface Song {
  bpm: number;
  /** Steps per beat; 2 = eighth notes, 4 = sixteenths. */
  stepsPerBeat: number;
  tracks: Track[];
}

interface NoteEvent {
  step: number;
  length: number;
  notes: string[];
}

interface ParsedTrack {
  instrument: Instrument;
  volume: number;
  events: NoteEvent[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToFreq(note: string) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`Bad note "${note}"`);
  const semis = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}

function parseTrack(track: Track): { parsed: ParsedTrack; steps: number } {
  const tokens = track.pattern.split(/\s+/).filter((t) => t && t !== '|');
  const events: NoteEvent[] = [];
  let current: NoteEvent | null = null;
  tokens.forEach((tok, step) => {
    if (tok === '-') {
      if (current) current.length++;
      return;
    }
    current = null;
    if (tok === '.') return;
    current = { step, length: 1, notes: tok.split('+') };
    events.push(current);
  });
  return { parsed: { instrument: track.instrument, volume: track.volume, events }, steps: tokens.length };
}

// --- Instruments ---------------------------------------------------------

type Play = (ctx: AudioContext, out: AudioNode, t: number, note: string, dur: number, vol: number, noise: AudioBuffer) => void;

function env(ctx: AudioContext, out: AudioNode, t: number, dur: number, vol: number, attack: number, release: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur + release);
  g.connect(out);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, t: number, stop: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

function drum(ctx: AudioContext, out: AudioNode, t: number, kind: string, vol: number, noise: AudioBuffer) {
  if (kind === 'k') {
    const o = osc(ctx, 'sine', 150, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(out);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const len = kind === 's' ? 0.16 : 0.05;
  filter.type = kind === 's' ? 'bandpass' : 'highpass';
  filter.frequency.value = kind === 's' ? 1800 : 7000;
  g.gain.setValueAtTime(vol * (kind === 's' ? 0.7 : 0.25), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.02);
  if (kind === 's') {
    const o = osc(ctx, 'triangle', 220, t, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(out);
  }
}

const instruments: Record<Exclude<Instrument, 'drums'>, Play> = {
  lead(ctx, out, t, note, dur, vol) {
    const f = noteToFreq(note);
    const g = env(ctx, out, t, dur, vol, 0.01, 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.connect(g);
    const o = osc(ctx, 'square', f, t, t + dur + 0.1);
    // Delayed vibrato on held notes.
    const lfo = osc(ctx, 'sine', 5.5, t, t + dur + 0.1);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.4));
    lfo.connect(depth).connect(o.frequency);
    o.connect(lp);
  },
  accordion(ctx, out, t, note, dur, vol) {
    const f = noteToFreq(note);
    const g = env(ctx, out, t, dur, vol, 0.03, 0.06);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 2;
    lp.connect(g);
    for (const d of [-7, 7]) osc(ctx, 'sawtooth', f, t, t + dur + 0.1, d).connect(lp);
    // Gentle bellows tremolo.
    const trem = osc(ctx, 'sine', 6, t, t + dur + 0.1);
    const tg = ctx.createGain();
    tg.gain.value = vol * 0.15;
    trem.connect(tg).connect(g.gain);
  },
  pluck(ctx, out, t, note, dur, vol) {
    const f = noteToFreq(note);
    const len = Math.min(dur, 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    g.connect(out);
    osc(ctx, 'triangle', f, t, t + len + 0.02).connect(g);
    const sq = ctx.createGain();
    sq.gain.value = 0.25;
    osc(ctx, 'square', f, t, t + len + 0.02).connect(sq).connect(g);
  },
  bass(ctx, out, t, note, dur, vol) {
    const f = noteToFreq(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    g.connect(out);
    osc(ctx, 'triangle', f, t, t + dur + 0.05).connect(g);
    const sub = ctx.createGain();
    sub.gain.value = 0.3;
    osc(ctx, 'square', f, t, t + dur + 0.05).connect(sub).connect(g);
  },
  pad(ctx, out, t, note, dur, vol) {
    const f = noteToFreq(note);
    const g = env(ctx, out, t, dur, vol, 0.25, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    lp.connect(g);
    for (const d of [-10, 0, 10]) osc(ctx, 'sawtooth', f, t, t + dur + 0.5, d).connect(lp);
  },
};

// --- Player ----------------------------------------------------------------

class SongPlayer {
  readonly gain: GainNode;
  private tracks: ParsedTrack[];
  private steps: number;
  private stepDur: number;
  private nextStep = 0;
  private nextTime: number;

  constructor(private ctx: AudioContext, out: AudioNode, private noise: AudioBuffer, song: Song) {
    const parsed = song.tracks.map(parseTrack);
    this.tracks = parsed.map((p) => p.parsed);
    this.steps = Math.max(...parsed.map((p) => p.steps));
    this.stepDur = 60 / song.bpm / song.stepsPerBeat;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.nextTime = ctx.currentTime + 0.1;
  }

  schedule(until: number) {
    // After a stall (tab hidden, long frame) skip ahead instead of bursting.
    if (this.nextTime < this.ctx.currentTime) {
      const behind = Math.ceil((this.ctx.currentTime - this.nextTime) / this.stepDur);
      this.nextStep += behind;
      this.nextTime += behind * this.stepDur;
    }
    while (this.nextTime < until) {
      const step = this.nextStep % this.steps;
      for (const tr of this.tracks) {
        for (const ev of tr.events) {
          if (ev.step !== step) continue;
          const dur = ev.length * this.stepDur * 0.95;
          for (const n of ev.notes) {
            if (tr.instrument === 'drums') drum(this.ctx, this.gain, this.nextTime, n, tr.volume, this.noise);
            else instruments[tr.instrument](this.ctx, this.gain, this.nextTime, n, dur, tr.volume / Math.sqrt(ev.notes.length), this.noise);
          }
        }
      }
      this.nextStep++;
      this.nextTime += this.stepDur;
    }
  }
}

const LOOKAHEAD = 0.15;
const FADE = 1.5;

/** Plays one song at a time and crossfades between them. */
export class Music {
  private current: { song: Song; player: SongPlayer } | null = null;
  private fading: SongPlayer[] = [];
  private bus: GainNode | null = null;
  private wanted: Song | null = null;
  volume = 0.55;

  /** Request a song (or silence with null). Safe to call every frame. */
  play(song: Song | null) {
    this.wanted = song;
  }

  update() {
    const graph = audioGraph();
    if (!graph) return;
    const { ctx, master, noiseBuffer } = graph;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.volume / 0.35;
      this.bus.connect(master);
    }
    if (this.wanted !== (this.current?.song ?? null)) {
      if (this.current) {
        const p = this.current.player;
        p.gain.gain.cancelScheduledValues(ctx.currentTime);
        p.gain.gain.setValueAtTime(p.gain.gain.value, ctx.currentTime);
        p.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE);
        this.fading.push(p);
        setTimeout(() => {
          p.gain.disconnect();
          this.fading = this.fading.filter((f) => f !== p);
        }, FADE * 1000 + 300);
      }
      this.current = null;
      if (this.wanted) {
        const player = new SongPlayer(ctx, this.bus, noiseBuffer, this.wanted);
        player.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
        this.current = { song: this.wanted, player };
      }
    }
    const until = ctx.currentTime + LOOKAHEAD;
    this.current?.player.schedule(until);
    for (const f of this.fading) f.schedule(until);
  }
}
