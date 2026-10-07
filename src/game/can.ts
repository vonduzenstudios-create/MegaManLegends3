import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { toonMesh } from '../engine/toon';
import { sfx } from '../engine/audio';
import type { Kickable } from './types';

const RADIUS = 0.13;
const HEIGHT = 0.32;
const GRAVITY = 25;
const RESTITUTION = 0.5;

/** The kickable can: a tiny rigid body that tumbles, bounces and rolls. */
export class Can implements Kickable {
  readonly group = new THREE.Group();
  readonly radius = 0.2;
  private readonly mesh = new THREE.Group();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly spin = new THREE.Vector3();
  private grounded = true;
  private readonly _center = new THREE.Vector3();

  constructor(private world: CollisionWorld, start: THREE.Vector3) {
    this.pos.copy(start);
    const body = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 16), 0xd8342c);
    const band = toonMesh(new THREE.CylinderGeometry(RADIUS + 0.005, RADIUS + 0.005, 0.09, 16), 0xf4f4f4, { outline: false });
    const lid = toonMesh(new THREE.CylinderGeometry(RADIUS * 0.92, RADIUS * 0.92, 0.02, 16), 0xb8bec8, { outline: false });
    lid.position.y = HEIGHT / 2 + 0.005;
    this.mesh.add(body, band, lid);
    this.group.add(this.mesh);
    this.mesh.position.y = HEIGHT / 2;
    this.sync();
  }

  get center() {
    return this._center.set(this.pos.x, this.pos.y + HEIGHT / 2, this.pos.z);
  }

  /** Put the can back, standing upright and still. */
  reset(pos: THREE.Vector3) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.mesh.quaternion.identity();
    this.grounded = true;
    this.sync();
  }

  kick(dir: THREE.Vector3, power: number) {
    this.vel.copy(dir).multiplyScalar(power);
    this.vel.y = Math.max(this.vel.y, power * 0.45);
    this.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30);
    this.grounded = false;
    sfx.canHit();
  }

  /** Lets a running player shove the can along with their feet. */
  nudge(from: THREE.Vector3, playerVel: THREE.Vector3) {
    const dx = this.pos.x - from.x;
    const dz = this.pos.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.45 || d < 1e-4 || Math.abs(this.pos.y - from.y) > 0.4) return;
    const speed = Math.hypot(playerVel.x, playerVel.z);
    if (speed < 0.5) return;
    this.vel.x = (dx / d) * speed * 1.2;
    this.vel.z = (dz / d) * speed * 1.2;
    this.spin.set(this.vel.z * 6, 0, -this.vel.x * 6);
    sfx.canBounce(speed);
  }

  update(dt: number) {
    const before = this.vel.clone();
    this.vel.y -= GRAVITY * dt;
    const res = this.world.moveCylinder(this.pos, this.vel, RADIUS, HEIGHT, dt, this.grounded);

    if (res.hitWall) {
      // Undo the slide and reflect: v' = v - (1 + e)(v·n)n.
      const removedX = before.x - this.vel.x;
      const removedZ = before.z - this.vel.z;
      this.vel.x -= removedX * RESTITUTION;
      this.vel.z -= removedZ * RESTITUTION;
      if (Math.hypot(removedX, removedZ) > 1) sfx.canBounce(Math.hypot(removedX, removedZ));
    }
    if (res.landingSpeed > 2) {
      this.vel.y = res.landingSpeed * RESTITUTION;
      this.spin.multiplyScalar(0.7);
      sfx.canBounce(res.landingSpeed);
      res.grounded = false;
    }
    this.grounded = res.grounded;

    if (this.grounded) {
      const decay = Math.exp(-3 * dt);
      this.vel.x *= decay;
      this.vel.z *= decay;
      this.spin.multiplyScalar(Math.exp(-4 * dt));
      // Roll along the ground in the direction of travel.
      this.spin.x = THREE.MathUtils.lerp(this.spin.x, this.vel.z / RADIUS, 0.2);
      this.spin.z = THREE.MathUtils.lerp(this.spin.z, -this.vel.x / RADIUS, 0.2);
    }

    const angle = this.spin.length() * dt;
    if (angle > 1e-5) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.spin.clone().normalize(), angle);
      this.mesh.quaternion.premultiply(q);
    }
    this.sync();
  }

  private sync() {
    this.group.position.copy(this.pos);
  }
}
