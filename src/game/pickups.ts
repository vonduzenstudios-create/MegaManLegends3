import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { sfx } from '../engine/audio';
import { toon } from '../engine/toon';
import type { Effects } from './effects';

type Kind = 'zenny' | 'health';

interface Pickup {
  kind: Kind;
  amount: number;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  /** Placed pickups (like the ones by the boss gate) never expire. */
  permanent: boolean;
  /** Can't be collected for a moment after spawning, so you see it pop out. */
  delay: number;
}

const gemGeo = new THREE.OctahedronGeometry(1, 0);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

// Refractor shard sizes, small to large.
const ZENNY_TIERS = [
  { value: 200, size: 0.3, color: 0xff5a5a },
  { value: 50, size: 0.22, color: 0x5ab0ff },
  { value: 10, size: 0.15, color: 0x7cff6a },
];

export interface Collector {
  readonly pos: THREE.Vector3;
  life: number;
  readonly maxLife: number;
}

/** Zenny crystals and life energy dropped by Reaverbots. */
export class Pickups {
  zenny = 0;
  private items: Pickup[] = [];

  constructor(
    private scene: THREE.Scene,
    private world: CollisionWorld,
    private effects: Effects,
  ) {}

  /** Burst a total amount of zenny into the biggest shards that fit. */
  dropZenny(pos: THREE.Vector3, total: number) {
    let left = total;
    for (const tier of ZENNY_TIERS) {
      while (left >= tier.value) {
        left -= tier.value;
        this.spawn('zenny', tier.value, pos, tier.size, tier.color);
      }
    }
  }

  dropHealth(pos: THREE.Vector3, amount: number, permanent = false) {
    const p = this.spawn('health', amount, pos, amount >= 30 ? 0.32 : 0.22, 0x6ad8ff, permanent);
    if (permanent) p.vel.set(0, 0, 0);
  }

  private spawn(kind: Kind, amount: number, pos: THREE.Vector3, size: number, color: number, permanent = false) {
    const mesh = new THREE.Mesh(kind === 'zenny' ? gemGeo : cubeGeo, toon(color, { emissive: color }));
    (mesh.material as THREE.MeshToonMaterial).emissiveIntensity = 0.5;
    mesh.scale.set(size, kind === 'zenny' ? size * 1.5 : size, size);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const vel = new THREE.Vector3(Math.cos(a) * 2.5, 6 + Math.random() * 2, Math.sin(a) * 2.5);
    const p: Pickup = { kind, amount, mesh, vel, life: 18, permanent, delay: permanent ? 0 : 0.4 };
    this.items.push(p);
    return p;
  }

  clearDrops() {
    this.items = this.items.filter((p) => {
      if (p.permanent) return true;
      this.scene.remove(p.mesh);
      return false;
    });
  }

  update(dt: number, who: Collector | null, time: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      const m = p.mesh;
      p.delay -= dt;
      if (!p.permanent) p.life -= dt;

      // Bounce to rest on the floor.
      const size = m.scale.y;
      const floor = this.world.floorAt(m.position.x, m.position.z, 0.1, m.position.y + 0.5) + size;
      p.vel.y -= 22 * dt;
      m.position.addScaledVector(p.vel, dt);
      if (m.position.y < floor) {
        m.position.y = floor;
        p.vel.y = Math.abs(p.vel.y) > 2 ? -p.vel.y * 0.4 : 0;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      m.rotation.y += dt * 3;
      if (p.vel.y === 0) m.position.y = floor + 0.15 + Math.sin(time * 4 + i) * 0.08;
      m.visible = p.life > 4 || Math.floor(p.life * 8) % 2 === 0;

      let collected = false;
      if (who && p.delay <= 0) {
        const chest = who.pos.clone().setY(who.pos.y + 0.7);
        const d = chest.distanceTo(m.position);
        // Shards drift toward you when close.
        if (d < 2.2 && p.kind === 'zenny') m.position.lerp(chest, Math.min(1, dt * 8));
        if (d < 0.9) collected = true;
      }
      if (collected && who) {
        if (p.kind === 'zenny') {
          this.zenny += p.amount;
          sfx.zenny();
        } else {
          who.life = Math.min(who.maxLife, who.life + p.amount);
          sfx.heal();
        }
        this.effects.burst(m.position, { color: (m.material as THREE.MeshToonMaterial).color, count: 6, speed: 2.5, gravity: 2 });
      }
      if (collected || p.life <= 0) {
        this.scene.remove(m);
        this.items.splice(i, 1);
      }
    }
  }
}
