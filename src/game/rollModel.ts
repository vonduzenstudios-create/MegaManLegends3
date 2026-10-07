import * as THREE from 'three';
import { toonMesh } from '../engine/toon';
import { part, pivot, type PlayerRig } from './playerModel';

const C = {
  red: 0xd8282a,
  visor: 0xb4b8c2,
  hair: 0xf6c844,
  skin: 0xffdcbc,
  eye: 0x22a860,
  white: 0xf6f6f6,
  under: 0x2c2a3c,
  belt: 0x8a5a34,
  buckle: 0x9aa0a8,
  bike: 0x22222c,
  glove: 0x8a5a3c,
  orange: 0xf08a2a,
  sole: 0xb8bcc4,
  metal: 0xb8c0c8,
};

/** Roll's wrench. Long axis is local Y. */
export function buildWrench() {
  const g = new THREE.Group();
  const handle = toonMesh(new THREE.BoxGeometry(0.06, 0.42, 0.03), C.metal);
  g.add(handle);
  for (const s of [-1, 1]) {
    const jaw = toonMesh(new THREE.TorusGeometry(0.075, 0.03, 6, 12, Math.PI * 1.35), C.metal);
    jaw.position.y = s * 0.24;
    jaw.rotation.z = s > 0 ? -Math.PI * 0.18 : Math.PI * 0.82;
    g.add(jaw);
  }
  return g;
}

/** Roll built from primitives. Faces +Z, feet at y = 0, about 1.5 units tall. */
export function buildRollModel(): PlayerRig {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.72, 0);
  body.userData.baseY = 0.72;

  // Shorts, belt and buckle.
  part(body, new THREE.BoxGeometry(0.36, 0.2, 0.24), C.red, 0, -0.02, 0);
  part(body, new THREE.BoxGeometry(0.38, 0.06, 0.26), C.belt, 0, 0.09, 0);
  part(body, new THREE.BoxGeometry(0.1, 0.06, 0.02), C.buckle, 0, 0.09, 0.135);

  // Torso: dark undershirt with a cropped red jacket on top.
  const torso = pivot(body, 0, 0.1, 0);
  part(torso, new THREE.BoxGeometry(0.28, 0.2, 0.19), C.under, 0, 0.08, 0);
  part(torso, new THREE.BoxGeometry(0.38, 0.19, 0.25), C.red, 0, 0.25, 0);
  const collar = part(torso, new THREE.CylinderGeometry(0.075, 0.08, 0.09, 12), C.white, 0, 0.38, 0);
  collar.scale.z = 0.9;
  for (const y of [0.29, 0.21]) {
    const btn = part(torso, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), C.white, -0.05, y, 0.13);
    btn.rotation.x = Math.PI / 2;
  }

  // Head with cap, visor band, hair and ponytail.
  const head = pivot(torso, 0, 0.42, 0);
  part(head, new THREE.SphereGeometry(0.17, 16, 12), C.skin, 0, 0.12, 0.02);
  for (const s of [-1, 1]) {
    part(head, new THREE.BoxGeometry(0.05, 0.08, 0.02), C.eye, s * 0.06, 0.12, 0.18);
    part(head, new THREE.BoxGeometry(0.018, 0.022, 0.01), 0xffffff, s * 0.06 + 0.01, 0.145, 0.19);
    // Side locks framing the face.
    const lock = part(head, new THREE.BoxGeometry(0.05, 0.22, 0.1), C.hair, s * 0.16, 0.06, 0.06);
    lock.rotation.z = s * 0.12;
  }
  const bangs = part(head, new THREE.ConeGeometry(0.06, 0.14, 4), C.hair, 0.02, 0.2, 0.17);
  bangs.rotation.x = Math.PI;
  part(head, new THREE.BoxGeometry(0.3, 0.06, 0.08), C.hair, 0, 0.23, 0.12);
  const cap = part(head, new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), C.red, 0, 0.21, -0.01);
  cap.scale.set(1.12, 0.85, 1.12);
  const brim = part(head, new THREE.CylinderGeometry(0.235, 0.235, 0.035, 20), C.red, 0, 0.21, 0.0);
  brim.scale.z = 1.05;
  part(head, new THREE.BoxGeometry(0.3, 0.07, 0.04), C.visor, 0, 0.26, 0.19);
  for (const s of [-1, 1]) {
    const disc = part(head, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), C.visor, s * 0.08, 0.26, 0.215);
    disc.rotation.x = Math.PI / 2;
  }
  const ponytail = pivot(head, 0, 0.2, -0.17);
  const tufts: [number, number, number, number][] = [
    [0, -0.05, -0.12, 0.09],
    [0.06, -0.12, -0.2, 0.07],
    [-0.06, -0.1, -0.22, 0.07],
  ];
  for (const [x, y, z, r] of tufts) {
    const t = part(ponytail, new THREE.ConeGeometry(r, 0.42, 6), C.hair, x, y, z);
    t.rotation.x = -1.9;
    t.rotation.z = x * 3;
  }

  // Arms: red sleeve with a white cuff, bare forearm, brown glove.
  const makeArm = (side: number) => {
    const arm = pivot(torso, side * 0.24, 0.29, 0);
    part(arm, new THREE.SphereGeometry(0.085, 10, 8), C.red, 0, -0.02, 0);
    part(arm, new THREE.CylinderGeometry(0.075, 0.07, 0.1, 10), C.red, 0, -0.08, 0);
    part(arm, new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), C.white, 0, -0.14, 0);
    part(arm, new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), C.skin, 0, -0.19, 0);
    const fore = pivot(arm, 0, -0.23, 0);
    part(fore, new THREE.CylinderGeometry(0.045, 0.04, 0.16, 8), C.skin, 0, -0.07, 0);
    part(fore, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), C.white, 0, -0.15, 0);
    part(fore, new THREE.SphereGeometry(0.06, 10, 8), C.glove, 0, -0.2, 0);
    return { arm, fore };
  };
  const left = makeArm(1);
  const right = makeArm(-1);

  // A compact arm buster over her left glove, like Mega Man's.
  part(left.fore, new THREE.CylinderGeometry(0.075, 0.085, 0.2, 12), C.red, 0, -0.17, 0);
  part(left.fore, new THREE.CylinderGeometry(0.087, 0.087, 0.035, 12), C.orange, 0, -0.1, 0);
  part(left.fore, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), 0x202638, 0, -0.28, 0);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.3, 0);
  left.fore.add(muzzle);

  // Wrench in the right hand, pointing forward.
  const wrench = buildWrench();
  wrench.position.set(0, -0.22, 0.12);
  wrench.rotation.x = Math.PI / 2;
  right.fore.add(wrench);

  // Legs: black bike shorts, bare shins and chunky boots.
  const makeLeg = (side: number) => {
    const leg = pivot(body, side * 0.1, -0.08, 0);
    part(leg, new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), C.white, 0, -0.04, 0);
    part(leg, new THREE.CylinderGeometry(0.075, 0.065, 0.24, 10), C.bike, 0, -0.17, 0);
    const shin = pivot(leg, 0, -0.3, 0);
    part(shin, new THREE.CylinderGeometry(0.055, 0.045, 0.2, 8), C.skin, 0, -0.06, 0);
    part(shin, new THREE.CylinderGeometry(0.09, 0.1, 0.16, 10), C.red, 0, -0.17, 0);
    part(shin, new THREE.CylinderGeometry(0.092, 0.092, 0.04, 10), C.orange, 0, -0.12, 0);
    part(shin, new THREE.BoxGeometry(0.18, 0.12, 0.3), C.red, 0, -0.27, 0.04);
    part(shin, new THREE.BoxGeometry(0.19, 0.05, 0.31), C.sole, 0, -0.33, 0.04);
    part(shin, new THREE.BoxGeometry(0.185, 0.03, 0.2), C.orange, 0, -0.22, 0.06);
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
    ponytail,
  };
}
