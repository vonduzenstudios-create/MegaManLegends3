import type { PlayerRig } from './playerModel';
import { buildZeroModel } from './zeroModel';

export type CharacterId = 'zero';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  build: () => PlayerRig;
  runSpeed: number;
  jumpSpeed: number;
  maxLife: number;
  /** kick: Zero's kick. swing: a wrench swing (unused since Roll became an NPC). */
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
};
