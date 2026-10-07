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
  muzzle: THREE.Object3D;
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  const m = toonMesh(geo, color);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * Mega Man Volnutt built from primitives. Faces +Z, feet at y = 0,
 * about 1.55 units tall.
 */
export function buildPlayerModel(): PlayerRig {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.78, 0); // hips

  // Pelvis and belt.
  part(body, new THREE.BoxGeometry(0.4, 0.16, 0.26), C.suit, 0, -0.02, 0);
  part(body, new THREE.BoxGeometry(0.42, 0.06, 0.28), C.belt, 0, 0.07, 0);

  // Torso.
  const torso = pivot(body, 0, 0.1, 0);
  part(torso, new THREE.BoxGeometry(0.42, 0.34, 0.26), C.suit, 0, 0.17, 0);
  part(torso, new THREE.BoxGeometry(0.46, 0.24, 0.3), C.armor, 0, 0.24, 0.01);
  part(torso, new THREE.BoxGeometry(0.2, 0.12, 0.05), C.armorLight, 0, 0.26, 0.17);

  // Head.
  const head = pivot(torso, 0, 0.4, 0);
  part(head, new THREE.SphereGeometry(0.19, 16, 12), C.skin, 0, 0.14, 0.04);
  const helmet = part(head, new THREE.SphereGeometry(0.235, 18, 14), C.helmet, 0, 0.18, -0.045);
  helmet.scale.set(1, 1, 1.05);
  // Fringe of hair peeking out under the helmet.
  part(head, new THREE.BoxGeometry(0.24, 0.05, 0.06), C.hair, 0, 0.27, 0.15);
  // Ear pieces.
  for (const s of [-1, 1]) {
    const ear = part(head, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), C.helmetTrim, s * 0.235, 0.15, -0.01);
    ear.rotation.z = Math.PI / 2;
    // Eyes.
    part(head, new THREE.BoxGeometry(0.045, 0.075, 0.02), C.eye, s * 0.065, 0.15, 0.22);
    part(head, new THREE.BoxGeometry(0.018, 0.022, 0.01), 0xffffff, s * 0.065 + 0.01, 0.17, 0.232);
  }
  // Helmet ridge.
  part(head, new THREE.BoxGeometry(0.05, 0.06, 0.3), C.helmetTrim, 0, 0.42, -0.04);

  // Arms: shoulder pivot -> upper arm -> elbow pivot -> forearm.
  const makeArm = (side: number, buster: boolean) => {
    const arm = pivot(torso, side * 0.29, 0.3, 0);
    part(arm, new THREE.SphereGeometry(0.11, 12, 10), C.armor, 0, 0, 0);
    part(arm, new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), C.suit, 0, -0.13, 0);
    const fore = pivot(arm, 0, -0.25, 0);
    if (buster) {
      part(fore, new THREE.CylinderGeometry(0.1, 0.11, 0.3, 14), C.buster, 0, -0.12, 0);
      part(fore, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), C.muzzle, 0, -0.28, 0);
    } else {
      part(fore, new THREE.CylinderGeometry(0.075, 0.085, 0.22, 12), C.armor, 0, -0.09, 0);
      part(fore, new THREE.SphereGeometry(0.075, 10, 8), C.armorLight, 0, -0.24, 0);
    }
    return { arm, fore };
  };
  const left = makeArm(1, true);
  const right = makeArm(-1, false);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.32, 0);
  left.fore.add(muzzle);

  // Legs: hip pivot -> thigh -> knee pivot -> shin and boot.
  const makeLeg = (side: number) => {
    const leg = pivot(body, side * 0.11, -0.08, 0);
    part(leg, new THREE.CylinderGeometry(0.075, 0.07, 0.3, 10), C.suit, 0, -0.15, 0);
    const shin = pivot(leg, 0, -0.32, 0);
    part(shin, new THREE.CylinderGeometry(0.1, 0.11, 0.24, 12), C.boot, 0, -0.1, 0);
    part(shin, new THREE.BoxGeometry(0.2, 0.12, 0.32), C.boot, 0, -0.3, 0.05);
    part(shin, new THREE.BoxGeometry(0.21, 0.04, 0.33), C.sole, 0, -0.37, 0.05);
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
