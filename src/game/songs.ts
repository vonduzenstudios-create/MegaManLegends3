import type { Song } from '../engine/music';

// Chord voicings for the off-beat "pah" of the oom-pah accompaniment.
const F = 'F4+A4+C5';
const C7 = 'C4+E4+Bb4';
const Bb = 'Bb3+D4+F4';
const C = 'C4+E4+G4';
const Dm = 'D4+F4+A4';
const Gm = 'G3+Bb3+D4';
const D7 = 'D4+F#4+C5';

const pah = (a: string, b = a) => `. ${a} . ${a} . ${b} . ${b}`;

/**
 * "Market Day": an original, bouncy accordion polka for Apple Market.
 * 16 bars of 4/4 in F major, written as eighth notes.
 */
export const marketTheme: Song = {
  bpm: 126,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'accordion',
      volume: 0.16,
      pattern: `
        C5 - A4 C5 F5 - E5 F5 | G5 - E5 C5 Bb4 - G4 .  | A4 C5 F5 A5 G5 F5 E5 F5 | D5 - Bb4 D5 E5 - C5 .
        C5 - A4 C5 F5 - E5 F5 | A5 - F5 D5 A4 - D5 F5 | G5 F5 E5 D5 C5 Bb4 A4 G4 | F4 - A4 C5 F5 - . .
        D5 F5 Bb5 - A5 G5 F5 D5 | C5 - F5 - A5 - G5 F5 | E5 G5 C6 - Bb5 G5 E5 C5 | F5 - C5 - A4 - C5 .
        D5 F5 Bb5 - A5 G5 F5 D5 | C5 F5 A5 - D6 - C6 A5 | Bb5 - G5 E5 C5 - E5 G5 | F5 - - - . . C5 .
      `,
    },
    {
      instrument: 'pluck',
      volume: 0.07,
      pattern: [
        pah(F), pah(C7), pah(F), pah(Bb, C), pah(F), pah(Dm), pah(Gm, C7), pah(F),
        pah(Bb), pah(F), pah(C7), pah(F), pah(Bb), pah(F, D7), pah(Gm, C7), pah(F),
      ].join(' | '),
    },
    {
      instrument: 'bass',
      volume: 0.22,
      pattern: `
        F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 . | Bb2 . F2 . C3 . G2 .
        F2 . C3 . F2 . C3 . | D3 . A2 . D3 . A2 . | G2 . D3 . C3 . G2 . | F2 . C3 . F2 . C3 .
        Bb2 . F2 . Bb2 . F2 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 .
        Bb2 . F2 . Bb2 . F2 . | F2 . C3 . D3 . A2 . | G2 . D3 . C3 . G2 . | F2 . C3 . F2 . C2 .
      `,
    },
    {
      instrument: 'drums',
      volume: 0.35,
      pattern: Array(16).fill('k+h h s+h h k+h h s+h h').join(' | '),
    },
  ],
};
