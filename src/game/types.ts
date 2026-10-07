import type * as THREE from 'three';

/** Anything the buster can hit and lock-on can track. */
export interface Target {
  readonly center: THREE.Vector3;
  readonly radius: number;
  readonly alive: boolean;
  hit(damage: number, dir: THREE.Vector3): void;
}

/** Anything that reacts to Mega Man's kick. */
export interface Kickable {
  readonly center: THREE.Vector3;
  readonly radius: number;
  kick(dir: THREE.Vector3, power: number): void;
}
