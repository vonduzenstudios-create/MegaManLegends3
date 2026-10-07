import * as THREE from 'three';
import { toonMesh } from '../engine/toon';
import type { Effects } from './effects';
import type { Target } from './types';

const MAX_HP = 6;
const RESPAWN_TIME = 4;

/** A floating practice drone for testing the buster, kick and lock-on. */
export class TrainingDrone implements Target {
  readonly group = new THREE.Group();
  readonly radius = 0.6;
  alive = true;
  private hp = MAX_HP;
  private flash = 0;
  private respawn = 0;
  private time = Math.random() * 10;
  private readonly knock = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly _center = new THREE.Vector3();
  private readonly materials: THREE.MeshToonMaterial[] = [];

  constructor(private effects: Effects, private home: THREE.Vector3) {
    const shell = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), 0xc9b48a);
    const band = toonMesh(new THREE.TorusGeometry(0.5, 0.07, 8, 24), 0x6d5c44);
    band.rotation.x = Math.PI / 2;
    const eyeRing = toonMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 18), 0x3a3328);
    eyeRing.rotation.x = Math.PI / 2;
    eyeRing.position.z = 0.44;
    const eye = toonMesh(new THREE.SphereGeometry(0.13, 14, 10), 0xff2a2a, { emissive: 0x991010, outline: false });
    eye.position.z = 0.5;
    this.group.add(shell, band, eyeRing, eye);
    for (const s of [-1, 1]) {
      const fin = toonMesh(new THREE.BoxGeometry(0.08, 0.35, 0.4), 0x6d5c44);
      fin.position.set(s * 0.55, 0.15, -0.1);
      fin.rotation.z = s * 0.4;
      this.group.add(fin);
    }
    // Per-instance materials so the hit flash doesn't light up every drone.
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshToonMaterial) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
    this.group.position.copy(home);
  }

  get center() {
    return this._center.copy(this.group.position);
  }

  hit(damage: number, dir: THREE.Vector3) {
    if (!this.alive) return;
    this.hp -= damage;
    this.flash = 0.12;
    this.knock.addScaledVector(dir, 2.5 * damage);
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.respawn = RESPAWN_TIME;
      this.effects.explosion(this.group.position);
    }
  }

  update(dt: number, lookAt: THREE.Vector3) {
    this.time += dt;
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.alive = true;
        this.hp = MAX_HP;
        this.offset.set(0, 0, 0);
        this.group.visible = true;
        this.effects.burst(this.home, { color: 0x9cf, count: 12, gravity: 0 });
      }
      return;
    }
    this.offset.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    this.offset.multiplyScalar(Math.exp(-1.5 * dt));
    this.group.position.copy(this.home).add(this.offset);
    this.group.position.y += Math.sin(this.time * 2) * 0.25;
    this.group.position.x += Math.sin(this.time * 0.7) * 0.8;

    const yaw = Math.atan2(lookAt.x - this.group.position.x, lookAt.z - this.group.position.z);
    this.group.rotation.y = yaw;

    this.flash -= dt;
    const flashing = this.flash > 0;
    for (const m of this.materials) {
      m.userData.baseEmissive ??= m.emissive.getHex();
      m.emissive.setHex(flashing ? 0xffffff : m.userData.baseEmissive);
    }
  }
}
