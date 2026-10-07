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

// --- Ruin -------------------------------------------------------------------

const arp = (root: string, third: string, fifth: string, top: string) => `${root} ${fifth} ${third} ${fifth} ${top} ${fifth} ${third} ${fifth}`;
const hold = (chord: string) => `${chord} - - - - - - -`;

/**
 * "Sleeping Machines": an original, hushed D-minor piece for the ruin.
 * Echoing plucked arpeggios under a lonely lead, 8 bars.
 */
export const ruinTheme: Song = {
  bpm: 88,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'lead',
      volume: 0.06,
      pattern: `
        A4 - - - D5 - E5 - | F5 - - - E5 - D5 - | D5 - - - Bb4 - C5 - | C#5 - - - - - . .
        A4 - - - D5 - F5 - | A5 - - - G5 - F5 - | G5 - F5 - E5 - D5 - | E5 - - - C#5 - - -
      `,
    },
    {
      instrument: 'pluck',
      volume: 0.07,
      pattern: [
        arp('D4', 'F4', 'A4', 'D5'), arp('D4', 'F4', 'Bb4', 'D5'), arp('D4', 'G4', 'Bb4', 'D5'), arp('C#4', 'E4', 'A4', 'C#5'),
        arp('D4', 'F4', 'A4', 'D5'), arp('C4', 'F4', 'A4', 'C5'), arp('D4', 'G4', 'Bb4', 'D5'), arp('C#4', 'E4', 'G4', 'A4'),
      ].join(' | '),
    },
    {
      instrument: 'pad',
      volume: 0.05,
      pattern: [hold('D3+A3+F4'), hold('Bb2+F3+D4'), hold('G2+D3+Bb3'), hold('A2+E3+C#4'), hold('D3+A3+F4'), hold('F2+C3+A3'), hold('G2+D3+Bb3'), hold('A2+E3+G3')].join(' | '),
    },
    {
      instrument: 'bass',
      volume: 0.16,
      pattern: 'D2 - - - . . A1 . | Bb1 - - - . . F2 . | G1 - - - . . D2 . | A1 - - - . . E2 . | D2 - - - . . A1 . | F1 - - - . . C2 . | G1 - - - . . D2 . | A1 - - - A1 . . .',
    },
    {
      instrument: 'drums',
      volume: 0.16,
      pattern: Array(8).fill('k . . . . h . . ').join(' | '),
    },
  ],
};

// --- Boss -------------------------------------------------------------------

const drive = (lo: string, hi: string) => `${lo} ${lo} ${hi} ${lo} ${lo} ${hi} ${lo} ${hi}`;

/**
 * "Colossus": an original, driving E-minor battle theme for the boss.
 * 8 bars of eighth notes, looped.
 */
export const bossTheme: Song = {
  bpm: 164,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'lead',
      volume: 0.09,
      pattern: `
        E5 - - B4 E5 - F#5 G5 | F#5 - E5 - D5 - B4 - | C5 - - E5 G5 - A5 G5 | F#5 - D5 - A4 - D5 -
        E5 - - B4 E5 - F#5 G5 | A5 - G5 - F#5 - G5 A5 | B5 - A5 G5 E5 - C5 E5 | D#5 - - - B4 - F#5 -
      `,
    },
    {
      instrument: 'bass',
      volume: 0.2,
      pattern: [drive('E2', 'E3'), drive('E2', 'E3'), drive('C2', 'C3'), drive('D2', 'D3'), drive('E2', 'E3'), drive('E2', 'E3'), drive('C2', 'C3'), drive('B1', 'B2')].join(' | '),
    },
    {
      instrument: 'pad',
      volume: 0.045,
      pattern: [hold('E3+G3+B3'), hold('E3+G3+B3'), hold('C3+E3+G3'), hold('D3+F#3+A3'), hold('E3+G3+B3'), hold('E3+G3+B3'), hold('C3+E3+G3'), hold('B2+D#3+F#3')].join(' | '),
    },
    {
      instrument: 'drums',
      volume: 0.32,
      pattern: Array(8).fill('k+h h s+h h k+h k+h s+h h').join(' | '),
    },
  ],
};
