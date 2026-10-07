import type { Recording, Song } from '../engine/music';

/**
 * Apple Market's theme: Matthew's own recording (public/music/market.mp3).
 * The loop skips the silence at either end of the file.
 */
export const marketTheme: Recording = {
  file: 'music/market.mp3',
  volume: 0.5,
  loopStart: 2.0,
  loopEnd: 118.75,
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
