import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { part, pivot, type PlayerRig } from './playerModel';

export interface VillagerLook {
  shirt: number;
  pants: number;
  hair: number;
  skin?: number;
  hat?: number;
  apron?: number;
  height?: number;
}

/** A simple townsperson rig with the same joint names as the heroes. */
export function buildVillager(look: VillagerLook): PlayerRig {
  const root = new THREE.Group();
  const s = look.height ?? 1;
  const skin = look.skin ?? 0xf6cfa8;
  const body = pivot(root, 0, 0.7, 0);
  part(body, new THREE.CylinderGeometry(0.2, 0.22, 0.2, 10), look.pants, 0, 0, 0);
  const torso = pivot(body, 0, 0.08, 0);
  part(torso, new THREE.CylinderGeometry(0.19, 0.22, 0.5, 12), look.shirt, 0, 0.24, 0);
  if (look.apron !== undefined) part(torso, new THREE.BoxGeometry(0.3, 0.45, 0.04), look.apron, 0, 0.18, 0.2);
  const head = pivot(torso, 0, 0.5, 0);
  part(head, new THREE.SphereGeometry(0.19, 14, 10), skin, 0, 0.16, 0);
  part(head, new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), look.hair, 0, 0.18, -0.02);
  for (const sx of [-1, 1]) part(head, new THREE.BoxGeometry(0.035, 0.05, 0.02), 0x2a2a30, sx * 0.065, 0.16, 0.18);
  if (look.hat !== undefined) {
    part(head, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), look.hat, 0, 0.3, 0);
    part(head, new THREE.CylinderGeometry(0.17, 0.19, 0.18, 14), look.hat, 0, 0.39, 0);
  }
  const arm = (side: number) => {
    const a = pivot(torso, side * 0.24, 0.44, 0);
    part(a, new THREE.CylinderGeometry(0.06, 0.055, 0.26, 8), look.shirt, 0, -0.13, 0);
    const f = pivot(a, 0, -0.27, 0);
    part(f, new THREE.CylinderGeometry(0.05, 0.045, 0.2, 8), skin, 0, -0.09, 0);
    return { a, f };
  };
  const leg = (side: number) => {
    const l = pivot(body, side * 0.1, -0.06, 0);
    part(l, new THREE.CylinderGeometry(0.075, 0.07, 0.32, 8), look.pants, 0, -0.16, 0);
    const sh = pivot(l, 0, -0.32, 0);
    part(sh, new THREE.CylinderGeometry(0.065, 0.06, 0.2, 8), look.pants, 0, -0.1, 0);
    part(sh, new THREE.BoxGeometry(0.13, 0.08, 0.22), 0x5a3a24, 0, -0.27, 0.03);
    return { l, sh };
  };
  const L = arm(1);
  const R = arm(-1);
  const LL = leg(1);
  const RL = leg(-1);
  root.scale.setScalar(s);
  return {
    root,
    body,
    torso,
    head,
    armL: L.a,
    armR: R.a,
    forearmL: L.f,
    forearmR: R.f,
    legL: LL.l,
    legR: RL.l,
    shinL: LL.sh,
    shinR: RL.sh,
    muzzle: new THREE.Object3D(),
  };
}

export const TALK_RANGE = 2.6;
const WALK_SPEED = 1.1;

/** Someone to talk to. Wanders near home and turns to face the player. */
export class Npc {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private target = new THREE.Vector3();
  private wait = Math.random() * 3;
  private phase = Math.random() * 10;
  private walking = false;
  private readonly bodyY: number;

  constructor(
    readonly name: string,
    readonly rig: PlayerRig,
    readonly lines: string[],
    private home: THREE.Vector3,
    private world: CollisionWorld,
    private wanderRadius = 0,
    yaw = 0,
  ) {
    this.pos.copy(home);
    this.target.copy(home);
    this.yaw = yaw;
    this.bodyY = rig.body.position.y;
    this.sync();
  }

  get talkPoint() {
    return this.pos;
  }

  update(dt: number, playerPos: THREE.Vector3, talking: boolean) {
    this.phase += dt;
    const toPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    let faceYaw: number | null = null;
    this.walking = false;

    if (toPlayer < TALK_RANGE + 1.5 || talking) {
      faceYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    } else if (this.wanderRadius > 0) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        this.wait -= dt;
        if (this.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * this.wanderRadius;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.wait = 2 + Math.random() * 4;
        }
      } else {
        const step = Math.min(d, WALK_SPEED * dt);
        const nx = this.pos.x + (dx / d) * step;
        const nz = this.pos.z + (dz / d) * step;
        // Don't wander into walls or props.
        if (this.world.sphereHits(new THREE.Vector3(nx, this.pos.y + 0.9, nz), 0.35)) this.target.copy(this.pos);
        else {
          this.pos.x = nx;
          this.pos.z = nz;
          this.walking = true;
          faceYaw = Math.atan2(dx, dz);
        }
      }
    }
    this.pos.y = this.world.floorAt(this.pos.x, this.pos.z, 0.2, this.pos.y + 0.5);
    if (faceYaw !== null) {
      const diff = Math.atan2(Math.sin(faceYaw - this.yaw), Math.cos(faceYaw - this.yaw));
      this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
    }
    this.sync();
  }

  private sync() {
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    const swing = this.walking ? Math.sin(this.phase * 7) * 0.5 : 0;
    r.legL.rotation.x = -swing;
    r.legR.rotation.x = swing;
    r.armL.rotation.x = swing * 0.8;
    r.armR.rotation.x = -swing * 0.8;
    r.armL.rotation.z = 0.1;
    r.armR.rotation.z = -0.1;
    r.forearmL.rotation.x = r.forearmR.rotation.x = -0.25;
    // Idle breathing.
    r.body.position.y = this.bodyY + Math.sin(this.phase * 2) * 0.01 + Math.abs(swing) * 0.03;
    r.head.rotation.x = 0;
  }
}
