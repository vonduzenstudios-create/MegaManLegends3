import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { MARKET, MARKET_GATE_Z, MARKET_HEIGHT } from './level/layout';
import { buildVillager, Npc, type VillagerLook } from './npc';

interface Resident {
  name: string;
  look: VillagerLook;
  /** Offset from the plaza centre. */
  at: [number, number];
  yaw: number;
  wander: number;
  lines: string[];
}

const RESIDENTS: Resident[] = [
  {
    name: 'Apple Vendor',
    look: { shirt: 0xf2f2f2, pants: 0x5a4a3a, hair: 0x8a5a2a, apron: 0xd84a3a },
    at: [-6, 10.8],
    yaw: Math.PI,
    wander: 0,
    lines: ['Apples! Crisp, sweet and picked this morning.', "Folks say the market's named after my stall. I don't argue with them."],
  },
  {
    name: 'Kid',
    look: { shirt: 0x4a9ae8, pants: 0x3a3a5a, hair: 0x3a2a1a, height: 0.8 },
    at: [7, -6],
    yaw: 0,
    wander: 2.5,
    lines: ["See that can? Bet you can't kick it into the fountain!"],
  },
  {
    name: 'Parts Dealer',
    look: { shirt: 0x8a6a3a, pants: 0x3a3a42, hair: 0x9a9a9a, hat: 0x5a4a3a },
    at: [19, 10],
    yaw: -Math.PI / 2,
    wander: 0,
    lines: [
      "An airship engine? You'd need a Reaverbot core to rebuild one of those.",
      "There's supposed to be a big one deep in the old ruin by the gate. Nobody's opened that door in years.",
    ],
  },
  {
    name: 'Old Man',
    look: { shirt: 0x6a8a5a, pants: 0x4a4a3a, hair: 0xe8e8e8 },
    at: [-6.6, -5.4],
    yaw: Math.PI / 4,
    wander: 0,
    lines: ['A ship came down in the south field this morning.', 'Shook my teacup right off the table, it did.'],
  },
  {
    name: 'Gate Guard',
    look: { shirt: 0x2f5fa8, pants: 0x2a2a3a, hair: 0x5a3a1a, hat: 0x2f5fa8 },
    at: [2.6, MARKET_GATE_Z - MARKET.y + 2.2],
    yaw: Math.PI,
    wander: 0,
    lines: [
      'Welcome to Apple Market!',
      'That ruin door to the west of the gate is sealed tight. Something big moves around down there at night.',
    ],
  },
  {
    name: 'Baker',
    look: { shirt: 0xf6e8d8, pants: 0x6a5a8a, hair: 0xd8a040, apron: 0xffffff, hat: 0xffffff },
    at: [5.5, 15],
    yaw: Math.PI,
    wander: 2,
    lines: ['The apple in the fountain was carved by my grandfather.', 'He was a terrible sculptor, but we love it anyway.'],
  },
  {
    name: 'Traveler',
    look: { shirt: 0xb84a5a, pants: 0x4a3a2a, hair: 0x2a2a2a },
    at: [-12, -2],
    yaw: Math.PI / 2,
    wander: 4,
    lines: ['I came here for the apples and stayed for the music.', "Someone's always playing that accordion tune."],
  },
];

export function buildTownsfolk(world: CollisionWorld) {
  return RESIDENTS.map(
    (r) =>
      new Npc(
        r.name,
        buildVillager(r.look),
        [...r.lines],
        new THREE.Vector3(MARKET.x + r.at[0], MARKET_HEIGHT, MARKET.y + r.at[1]),
        world,
        r.wander,
        r.yaw,
      ),
  );
}
