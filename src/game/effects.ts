import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

const sparkGeo = new THREE.IcosahedronGeometry(1, 0);

/** Pooled, unlit particle bursts for hits, explosions and dust. */
export class Effects {
  private pool: Particle[] = [];
  private active: Particle[] = [];

  constructor(private scene: THREE.Scene) {}

  private spawn(pos: THREE.Vector3, color: THREE.ColorRepresentation) {
    let p = this.pool.pop();
    if (!p) {
      const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ transparent: true }));
      p = { mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, gravity: 0 };
    }
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    p.mesh.position.copy(pos);
    this.scene.add(p.mesh);
    this.active.push(p);
    return p;
  }

  burst(pos: THREE.Vector3, opts: { count?: number; color?: THREE.ColorRepresentation; speed?: number; size?: number; life?: number; gravity?: number } = {}) {
    const { count = 10, color = 0xffe680, speed = 5, size = 0.08, life = 0.35, gravity = -6 } = opts;
    for (let i = 0; i < count; i++) {
      const p = this.spawn(pos, color);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.4);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
    }
  }

  explosion(pos: THREE.Vector3) {
    this.burst(pos, { count: 18, color: 0xffb030, speed: 7, size: 0.18, life: 0.5, gravity: 2 });
    this.burst(pos, { count: 10, color: 0xffffff, speed: 4, size: 0.12, life: 0.3, gravity: 0 });
    this.burst(pos, { count: 8, color: 0x555555, speed: 2, size: 0.25, life: 0.8, gravity: 3 });
  }

  dust(pos: THREE.Vector3, count = 6) {
    this.burst(pos, { count, color: 0xd8cfb0, speed: 2, size: 0.1, life: 0.4, gravity: 1 });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.size * (0.4 + 0.6 * t));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 1.5);
    }
  }
}
