import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import type { Effects } from './effects';
import type { Target } from './types';
import { sfx } from '../engine/audio';

const SHOT_SPEED = 30;
const SHOT_RADIUS = 0.14;

interface Shot {
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

export class Projectiles {
  private shots: Shot[] = [];

  constructor(
    private scene: THREE.Scene,
    private world: CollisionWorld,
    private effects: Effects,
    private targets: () => Target[],
  ) {}

  get count() {
    return this.shots.length;
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, opts: { range?: number; damage?: number; homing?: Target | null } = {}) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(glowGeo, glowMat));
    group.position.copy(origin);
    this.scene.add(group);
    this.shots.push({
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
      // Gentle homing keeps locked-on shots honest against moving targets.
      if (s.homing?.alive) {
        tmp.subVectors(s.homing.center, s.group.position).normalize().multiplyScalar(SHOT_SPEED);
        s.vel.lerp(tmp, Math.min(1, dt * 10)).setLength(SHOT_SPEED);
      }
      const step = s.vel.length() * dt;
      s.group.position.addScaledVector(s.vel, dt);
      s.travelled += step;
      s.group.scale.setScalar(1 + Math.sin(s.travelled * 3) * 0.15);

      let dead = false;
      for (const t of this.targets()) {
        if (!t.alive) continue;
        if (s.group.position.distanceToSquared(t.center) < (t.radius + SHOT_RADIUS) ** 2) {
          t.hit(s.damage, s.vel.clone().normalize());
          this.effects.burst(s.group.position, { color: 0xc8ff80, count: 8 });
          sfx.hit();
          dead = true;
          break;
        }
      }
      if (!dead && this.world.sphereHits(s.group.position, SHOT_RADIUS)) {
        this.effects.burst(s.group.position, { color: 0xc8ff80, count: 6, speed: 3 });
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
