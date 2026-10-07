import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import type { Effects } from './effects';
import type { Target } from './types';
import { sfx } from '../engine/audio';

const SHOT_SPEED = 30;
const SHOT_RADIUS = 0.14;

interface Shot {
  missile: boolean;
  group: THREE.Group;
  vel: THREE.Vector3;
  travelled: number;
  range: number;
  damage: number;
  homing: Target | null;
}

const coreGeo = new THREE.SphereGeometry(SHOT_RADIUS, 10, 8);
const glowGeo = new THREE.SphereGeometry(SHOT_RADIUS * 1.9, 10, 8);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffe0 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0x9cff5a, transparent: true, opacity: 0.45, depthWrite: false });
const missileGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.45, 8).rotateX(Math.PI / 2);
const missileTipGeo = new THREE.ConeGeometry(0.09, 0.18, 8).rotateX(Math.PI / 2).translate(0, 0, 0.3);
const missileMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
const missileTipMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
const MISSILE_SPEED = 20;

export class Projectiles {
  private shots: Shot[] = [];

  constructor(
    private scene: THREE.Scene,
    private world: CollisionWorld,
    private effects: Effects,
    private targets: () => Target[],
  ) {}

  /** Buster shots in flight (missiles don't count toward the limit). */
  get count() {
    return this.shots.filter((s) => !s.missile).length;
  }

  /** Active Buster: a homing missile that curls toward its target. */
  fireMissile(origin: THREE.Vector3, dir: THREE.Vector3, target: Target | null) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(missileGeo, missileMat), new THREE.Mesh(missileTipGeo, missileTipMat));
    group.position.copy(origin);
    this.scene.add(group);
    this.shots.push({
      missile: true,
      group,
      vel: dir.clone().normalize().multiplyScalar(MISSILE_SPEED * 0.5),
      travelled: 0,
      range: 45,
      damage: 4,
      homing: target,
    });
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, opts: { range?: number; damage?: number; homing?: Target | null } = {}) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(glowGeo, glowMat));
    group.position.copy(origin);
    this.scene.add(group);
    this.shots.push({
      missile: false,
      group,
      vel: dir.clone().normalize().multiplyScalar(SHOT_SPEED),
      travelled: 0,
      range: opts.range ?? 22,
      damage: opts.damage ?? 1,
      homing: opts.homing ?? null,
    });
    sfx.buster();
  }

  update(dt: number) {
    const tmp = new THREE.Vector3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const speed = s.missile ? Math.min(MISSILE_SPEED * 1.4, s.vel.length() + dt * 30) : SHOT_SPEED;
      // Homing: gentle for locked-on buster shots, strong for missiles.
      if (s.homing?.alive) {
        tmp.subVectors(s.homing.center, s.group.position).normalize().multiplyScalar(speed);
        s.vel.lerp(tmp, Math.min(1, dt * (s.missile ? 5 : 10)));
      }
      s.vel.setLength(speed);
      const step = s.vel.length() * dt;
      s.group.position.addScaledVector(s.vel, dt);
      s.travelled += step;
      if (s.missile) {
        s.group.lookAt(tmp.copy(s.group.position).add(s.vel));
        if (Math.random() < 0.5) this.effects.burst(s.group.position, { color: 0xdddddd, count: 1, speed: 0.5, size: 0.08, life: 0.4, gravity: 1 });
      } else s.group.scale.setScalar(1 + Math.sin(s.travelled * 3) * 0.15);

      let dead = false;
      for (const t of this.targets()) {
        if (!t.alive) continue;
        if (s.group.position.distanceToSquared(t.center) < (t.radius + SHOT_RADIUS) ** 2) {
          t.hit(s.damage, s.vel.clone().normalize());
          if (s.missile) this.effects.explosion(s.group.position);
          else this.effects.burst(s.group.position, { color: 0xc8ff80, count: 8 });
          sfx.hit();
          dead = true;
          break;
        }
      }
      if (!dead && this.world.sphereHits(s.group.position, SHOT_RADIUS)) {
        if (s.missile) this.effects.explosion(s.group.position);
        else this.effects.burst(s.group.position, { color: 0xc8ff80, count: 6, speed: 3 });
        dead = true;
      }
      if (!dead && s.travelled > s.range) {
        this.effects.burst(s.group.position, { color: 0xc8ff80, count: 4, speed: 1.5, gravity: 0 });
        dead = true;
      }
      if (dead) {
        this.scene.remove(s.group);
        this.shots.splice(i, 1);
      }
    }
  }
}
