import type { PlayerRig } from './playerModel';
import { buildRollModel } from './rollModel';
import { buildZeroModel } from './zeroModel';

export type CharacterId = 'zero' | 'roll';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  build: () => PlayerRig;
  runSpeed: number;
  jumpSpeed: number;
  maxLife: number;
  /** kick: Zero's kick. swing: Roll's wrench swing. */
  melee: 'kick' | 'swing';
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  zero: {
    id: 'zero',
    name: 'Zero',
    tagline: 'Arm buster rapid fire and a can-launching kick.',
    build: buildZeroModel,
    runSpeed: 6.5,
    jumpSpeed: 10.5,
    maxLife: 100,
    melee: 'kick',
  },
  roll: {
    id: 'roll',
    name: 'Roll Caskett',
    tagline: 'Her own arm buster and a heavy wrench swing that sends cans flying.',
    build: buildRollModel,
    runSpeed: 6.5,
    jumpSpeed: 10.5,
    maxLife: 100,
    melee: 'swing',
  },
};
