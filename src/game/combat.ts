import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import type { Effects } from './effects';

/** What enemy attacks need to know about the player. */
export interface Victim {
  readonly pos: THREE.Vector3;
  readonly grounded: boolean;
  takeDamage(amount: number, from: THREE.Vector3): boolean;
}

export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.5;

/** Does a sphere touch the player's body cylinder? */
export function touchesPlayer(v: Victim, p: THREE.Vector3, r: number) {
  const dx = p.x - v.pos.x;
  const dz = p.z - v.pos.z;
  if (dx * dx + dz * dz > (PLAYER_RADIUS + r) ** 2) return false;
  return p.y > v.pos.y - r && p.y < v.pos.y + PLAYER_HEIGHT + r;
}

interface Orb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
}

interface Wave {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  maxRadius: number;
  damage: number;
  hitDone: boolean;
}

const orbGeo = new THREE.SphereGeometry(1, 12, 8);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
ringGeo.rotateX(-Math.PI / 2);

/** Reaverbot energy shots and ground shockwaves that hurt the player. */
export class EnemyShots {
  private orbs: Orb[] = [];
  private waves: Wave[] = [];

  constructor(
    private scene: THREE.Scene,
    private world: CollisionWorld,
    private effects: Effects,
  ) {}

  fire(origin: THREE.Vector3, vel: THREE.Vector3, opts: { damage?: number; radius?: number; color?: number } = {}) {
    const { damage = 10, radius = 0.22, color = 0xff8a30 } = opts;
    const mesh = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color }));
    mesh.scale.setScalar(radius);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.orbs.push({ mesh, vel: vel.clone(), life: 6, damage, radius });
  }

  /** A ring that rolls outward along the floor; jump over it. */
  shockwave(center: THREE.Vector3, opts: { speed?: number; maxRadius?: number; damage?: number } = {}) {
    const { speed = 11, maxRadius = 16, damage = 15 } = opts;
    const mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.position.copy(center).setY(center.y + 0.08);
    this.scene.add(mesh);
    this.waves.push({ mesh, center: center.clone(), radius: 0.5, speed, maxRadius, damage, hitDone: false });
  }

  clear() {
    for (const o of this.orbs) this.scene.remove(o.mesh);
    for (const w of this.waves) this.scene.remove(w.mesh);
    this.orbs = [];
    this.waves = [];
  }

  update(dt: number, victim: Victim | null) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.mesh.position.addScaledVector(o.vel, dt);
      o.life -= dt;
      o.mesh.scale.setScalar(o.radius * (1 + Math.sin(o.life * 30) * 0.12));
      let dead = o.life <= 0;
      if (!dead && victim && touchesPlayer(victim, o.mesh.position, o.radius)) {
        victim.takeDamage(o.damage, o.mesh.position);
        dead = true;
      }
      if (!dead && this.world.sphereHits(o.mesh.position, o.radius * 0.7)) dead = true;
      if (dead) {
        this.effects.burst(o.mesh.position, { color: (o.mesh.material as THREE.MeshBasicMaterial).color, count: 6, speed: 3 });
        this.scene.remove(o.mesh);
        this.orbs.splice(i, 1);
      }
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.radius += w.speed * dt;
      w.mesh.scale.set(w.radius, 1, w.radius);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - w.radius / w.maxRadius);
      if (victim && !w.hitDone) {
        const d = Math.hypot(victim.pos.x - w.center.x, victim.pos.z - w.center.z);
        const onFloor = victim.pos.y - w.center.y < 0.45;
        if (Math.abs(d - w.radius) < 0.55 && onFloor) {
          w.hitDone = victim.takeDamage(w.damage, w.center);
        }
      }
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        this.effects.dust(new THREE.Vector3(w.center.x + Math.cos(a) * w.radius, w.center.y + 0.1, w.center.z + Math.sin(a) * w.radius), 1);
      }
      if (w.radius >= w.maxRadius) {
        this.scene.remove(w.mesh);
        this.waves.splice(i, 1);
      }
    }
  }
}
