import * as THREE from 'three';
import { toonMesh } from '../engine/toon';

const C = {
  helmet: 0x2f6fe0,
  helmetTrim: 0x8fd4ff,
  skin: 0xffd2a8,
  hair: 0x7a4a24,
  eye: 0x2c7a4a,
  suit: 0x1e3f9a,
  armor: 0x5fb4ff,
  armorLight: 0xbfe6ff,
  boot: 0x3c86f0,
  sole: 0xf0f0f0,
  buster: 0x4a8fe8,
  muzzle: 0x202638,
  belt: 0xf2c230,
};

/** Joint pivots the animator drives. */
export interface PlayerRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** Where buster shots leave from. */
  muzzle: THREE.Object3D;
  /** Hair or cloth that trails behind when moving. */
  ponytail?: THREE.Group;
  /**
   * Rigs with their own animation clips implement this. It runs after the
   * procedural joint animation each frame, so a model can play clips and
   * only borrow the proxy joints it needs (aiming arm, kicking leg).
   */
  drive?: (state: AnimState, dt: number) => void;
}

/** What the player is doing this frame, for clip-driven rigs. */
export interface AnimState {
  /** Horizontal speed as a fraction of top speed, 0..1. */
  speed: number;
  /** World-space velocity. */
  vel: THREE.Vector3;
  /** Facing change per second, radians. */
  yawRate: number;
  grounded: boolean;
  /** True on the frame a jump starts. */
  justJumped: boolean;
  /** Downward speed on the frame the player touched down, else 0. */
  landingSpeed: number;
  /** Kick progress 0..1, or -1 when not kicking. */
  kick: number;
  aiming: boolean;
  hurt: boolean;
  dead: boolean;
  /** World direction to the lock-on target, if any. */
  lookDir: THREE.Vector3 | null;
}

export function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  const m = toonMesh(geo, color);
  // Characters cast shadows but skip receiving them: self-shadowing on
  // small, curved parts reads as dirty speckles under toon shading.
  m.receiveShadow = false;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * Mega Man Volnutt built from primitives. Faces +Z, feet at y = 0,
 * about 1.55 units tall.
 */
export function buildPlayerModel(): PlayerRig {
  // Proportions follow Matthew's reference model (see
  // /mnt/project-files/reference/megaman): hips 0.89, hip joints 0.82,
  // knees 0.51, shoulders 1.11, head pivot 1.21, helmet top 1.55.
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.89, 0); // hips
  body.userData.baseY = 0.89;

  // Pelvis and belt.
  part(body, new THREE.BoxGeometry(0.3, 0.14, 0.2), C.suit, 0, -0.03, 0);
  part(body, new THREE.BoxGeometry(0.32, 0.05, 0.22), C.belt, 0, 0.05, 0);

  // Torso: a slim suit with a chest plate on top.
  const torso = pivot(body, 0, 0.08, 0);
  part(torso, new THREE.BoxGeometry(0.28, 0.22, 0.2), C.suit, 0, 0.08, 0);
  part(torso, new THREE.BoxGeometry(0.34, 0.14, 0.24), C.armor, 0, 0.15, 0.01);
  part(torso, new THREE.BoxGeometry(0.14, 0.07, 0.04), C.armorLight, 0, 0.16, 0.14);
  part(torso, new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10), C.suit, 0, 0.22, 0);

  // Head: big and round, helmet top at 1.55.
  const head = pivot(torso, 0, 0.24, 0);
  part(head, new THREE.SphereGeometry(0.165, 16, 12), C.skin, 0, 0.1, 0.035);
  const helmet = part(head, new THREE.SphereGeometry(0.2, 18, 14), C.helmet, 0, 0.13, -0.03);
  helmet.scale.set(1, 1, 1.05);
  // Fringe of hair peeking out under the helmet.
  part(head, new THREE.BoxGeometry(0.2, 0.045, 0.05), C.hair, 0, 0.21, 0.13);
  for (const s of [-1, 1]) {
    // Ear pieces.
    const ear = part(head, new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14), C.helmetTrim, s * 0.2, 0.1, -0.01);
    ear.rotation.z = Math.PI / 2;
    // Eyes.
    part(head, new THREE.BoxGeometry(0.045, 0.07, 0.02), C.eye, s * 0.058, 0.11, 0.19);
    part(head, new THREE.BoxGeometry(0.018, 0.022, 0.01), 0xffffff, s * 0.058 + 0.01, 0.13, 0.201);
  }
  // Helmet ridge.
  part(head, new THREE.BoxGeometry(0.045, 0.05, 0.26), C.helmetTrim, 0, 0.32, -0.03);

  // Arms: shoulder pivot -> upper arm -> elbow pivot -> forearm.
  const makeArm = (side: number, buster: boolean) => {
    const arm = pivot(torso, side * 0.2, 0.14, 0);
    part(arm, new THREE.SphereGeometry(0.085, 12, 10), C.armor, 0, 0, 0);
    part(arm, new THREE.CylinderGeometry(0.048, 0.048, 0.15, 10), C.suit, 0, -0.09, 0);
    const fore = pivot(arm, 0, -0.17, 0);
    if (buster) {
      part(fore, new THREE.CylinderGeometry(0.1, 0.12, 0.32, 14), C.buster, 0, -0.13, 0);
      part(fore, new THREE.CylinderGeometry(0.122, 0.122, 0.04, 14), C.helmetTrim, 0, -0.04, 0);
      part(fore, new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), C.muzzle, 0, -0.3, 0);
    } else {
      part(fore, new THREE.CylinderGeometry(0.06, 0.07, 0.17, 12), C.armor, 0, -0.07, 0);
      part(fore, new THREE.SphereGeometry(0.065, 10, 8), C.armorLight, 0, -0.19, 0);
    }
    return { arm, fore };
  };
  const left = makeArm(1, true);
  const right = makeArm(-1, false);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.33, 0);
  left.fore.add(muzzle);

  // Legs: hip pivot -> thigh -> knee pivot -> bell-shaped boot.
  const makeLeg = (side: number) => {
    const leg = pivot(body, side * 0.09, -0.07, 0);
    part(leg, new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), C.suit, 0, -0.15, 0);
    const shin = pivot(leg, 0, -0.31, 0);
    part(shin, new THREE.CylinderGeometry(0.068, 0.068, 0.04, 12), C.helmetTrim, 0, 0.0, 0);
    part(shin, new THREE.CylinderGeometry(0.065, 0.11, 0.42, 14), C.boot, 0, -0.22, 0);
    part(shin, new THREE.BoxGeometry(0.2, 0.1, 0.3), C.boot, 0, -0.45, 0.06);
    part(shin, new THREE.BoxGeometry(0.21, 0.035, 0.31), C.sole, 0, -0.49, 0.06);
    return { leg, shin };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  return {
    root,
    body,
    torso,
    head,
    armL: left.arm,
    armR: right.arm,
    forearmL: left.fore,
    forearmR: right.fore,
    legL: legL.leg,
    legR: legR.leg,
    shinL: legL.shin,
    shinR: legR.shin,
    muzzle,
  };
}
