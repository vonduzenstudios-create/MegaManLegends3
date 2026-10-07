import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { sfx } from '../engine/audio';
import { toonMesh } from '../engine/toon';
import type { Effects } from './effects';
import type { Pickups } from './pickups';
import { type EnemyShots, type Victim, touchesPlayer } from './combat';
import type { Target } from './types';

// Reaverbots: pale ancient machines with a single glowing eye.
export const BONE = 0xe8e0cc;
export const TRIM = 0x55505e;
export const EYE = 0xff3a2a;

export interface EnemyContext {
  scene: THREE.Scene;
  world: CollisionWorld;
  effects: Effects;
  shots: EnemyShots;
  pickups: Pickups;
}

const tmp = new THREE.Vector3();

export abstract class Enemy implements Target {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  abstract readonly radius: number;
  hp: number;
  alive = true;
  /** Damage dealt by touching it. */
  contact = 10;
  protected yaw = 0;
  protected flash = 0;
  /** Set once the player has come close; asleep enemies just idle. */
  protected awake = false;

  constructor(
    protected ctx: EnemyContext,
    spawn: THREE.Vector3,
    hp: number,
    private reward: number,
  ) {
    this.hp = hp;
    this.pos.copy(spawn);
    this.center.copy(spawn);
    ctx.scene.add(this.root);
  }

  hit(damage: number, dir: THREE.Vector3) {
    if (!this.alive) return;
    this.hp -= damage;
    this.flash = 0.12;
    this.awake = true;
    this.onHit(dir);
    if (this.hp <= 0) this.die();
  }

  protected onHit(_dir: THREE.Vector3) {}

  /** Remove without a reward (used when resetting a fight). */
  despawn() {
    this.alive = false;
    this.ctx.scene.remove(this.root);
  }

  die() {
    this.alive = false;
    this.ctx.effects.explosion(this.center);
    sfx.explode();
    this.ctx.pickups.dropZenny(this.center, this.reward);
    if (Math.random() < 0.3) this.ctx.pickups.dropHealth(this.center, 10);
    this.ctx.scene.remove(this.root);
  }

  update(dt: number, victim: Victim | null) {
    if (!this.alive) return;
    if (victim && !this.awake && victim.pos.distanceTo(this.pos) < 16) this.awake = true;
    this.think(dt, victim);
    this.flash -= dt;
    this.root.visible = this.flash <= 0 || Math.floor(this.flash * 40) % 2 === 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (victim && this.contact > 0 && touchesPlayer(victim, this.center, this.radius * 0.9)) {
      victim.takeDamage(this.contact, this.center);
    }
  }

  protected abstract think(dt: number, victim: Victim | null): void;

  protected faceToward(p: THREE.Vector3, rate: number) {
    const goal = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    const d = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate);
  }

  /** Clear line of sight from a point to the player's chest? */
  protected canSee(from: THREE.Vector3, victim: Victim) {
    tmp.set(victim.pos.x, victim.pos.y + 0.9, victim.pos.z).sub(from);
    const dist = tmp.length();
    return this.ctx.world.raycast(from, tmp.normalize(), dist) >= dist - 0.1;
  }
}

function eye(parent: THREE.Object3D, r: number, z: number, y = 0) {
  const socket = toonMesh(new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.08, 16), TRIM, { outline: false });
  socket.rotation.x = Math.PI / 2;
  socket.position.set(0, y, z);
  const lens = toonMesh(new THREE.SphereGeometry(r, 14, 10), EYE, { emissive: 0xc01810, outline: false });
  lens.scale.z = 0.5;
  lens.position.set(0, y, z + 0.04);
  parent.add(socket, lens);
  return lens;
}

/** A round little Reaverbot that bounds toward you in hops. */
export class Hopper extends Enemy {
  readonly radius = 0.5;
  private vel = new THREE.Vector3();
  private grounded = true;
  private hopTimer = 0.6 + Math.random();
  private body: THREE.Group;

  constructor(ctx: EnemyContext, spawn: THREE.Vector3) {
    super(ctx, spawn, 3, 30);
    this.contact = 10;
    this.body = new THREE.Group();
    this.body.position.y = 0.5;
    const shell = toonMesh(new THREE.SphereGeometry(0.45, 16, 12), BONE);
    shell.scale.y = 0.85;
    const band = toonMesh(new THREE.TorusGeometry(0.44, 0.05, 6, 24), TRIM, { outline: false });
    band.rotation.x = Math.PI / 2;
    const fin = toonMesh(new THREE.BoxGeometry(0.08, 0.3, 0.4), TRIM);
    fin.position.set(0, 0.42, -0.05);
    this.body.add(shell, band, fin);
    eye(this.body, 0.14, 0.4, 0.05);
    for (const s of [-1, 1]) {
      const foot = toonMesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), TRIM);
      foot.position.set(s * 0.24, -0.42, 0.05);
      this.body.add(foot);
    }
    this.root.add(this.body);
  }

  protected onHit(dir: THREE.Vector3) {
    this.vel.x += dir.x * 3;
    this.vel.z += dir.z * 3;
  }

  protected think(dt: number, victim: Victim | null) {
    if (victim && this.awake) {
      this.faceToward(victim.pos, dt * 6);
      this.hopTimer -= dt;
      if (this.grounded && this.hopTimer <= 0) {
        this.hopTimer = 0.7 + Math.random() * 0.6;
        const dist = Math.hypot(victim.pos.x - this.pos.x, victim.pos.z - this.pos.z);
        const speed = Math.min(5, dist * 1.4);
        this.vel.set(Math.sin(this.yaw) * speed, 7 + Math.random() * 1.5, Math.cos(this.yaw) * speed);
        this.grounded = false;
      }
    }
    if (this.grounded) {
      this.vel.x *= Math.max(0, 1 - dt * 10);
      this.vel.z *= Math.max(0, 1 - dt * 10);
    }
    this.vel.y -= 25 * dt;
    const res = this.ctx.world.moveCylinder(this.pos, this.vel, 0.45, 0.9, dt, this.grounded);
    if (res.grounded && !this.grounded) this.ctx.effects.dust(this.pos, 3);
    this.grounded = res.grounded;
    // Squash and stretch.
    const s = this.grounded ? 1 - Math.max(0, 0.3 - this.hopTimer) * 0.8 : 1 + Math.min(0.2, Math.abs(this.vel.y) * 0.03);
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    this.center.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
  }
}

/** A stone sentry rooted to the floor that fires bursts of energy shots. */
export class Turret extends Enemy {
  readonly radius = 0.7;
  private head: THREE.Group;
  private muzzle = new THREE.Vector3();
  private cooldown = 1.5;
  private burst = 0;
  private burstTimer = 0;

  constructor(ctx: EnemyContext, spawn: THREE.Vector3) {
    super(ctx, spawn, 6, 60);
    this.contact = 6;
    const base = toonMesh(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 8), TRIM);
    base.position.y = 0.6;
    const column = toonMesh(new THREE.CylinderGeometry(0.42, 0.5, 0.8, 8), BONE);
    column.position.y = 1.5;
    this.head = new THREE.Group();
    this.head.position.y = 2.25;
    const dome = toonMesh(new THREE.SphereGeometry(0.62, 16, 12), BONE);
    dome.scale.y = 0.8;
    const brow = toonMesh(new THREE.BoxGeometry(1.0, 0.16, 0.5), TRIM);
    brow.position.set(0, 0.3, 0.3);
    this.head.add(dome, brow);
    eye(this.head, 0.22, 0.52, 0);
    this.root.add(base, column, this.head);
    this.root.position.copy(this.pos);
    ctx.world.addBox(spawn.clone().setY(spawn.y + 0.9), new THREE.Vector3(1.2, 1.8, 1.2));
    this.center.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
  }

  die() {
    super.die();
    // Leave the broken base behind.
    const stump = toonMesh(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 8), TRIM);
    stump.position.copy(this.pos).setY(this.pos.y + 0.6);
    this.ctx.scene.add(stump);
  }

  protected think(dt: number, victim: Victim | null) {
    if (!victim || !this.awake) return;
    const near = victim.pos.distanceTo(this.pos) < 24;
    if (near) this.faceToward(victim.pos, dt * 2.5);
    this.muzzle.set(this.pos.x + Math.sin(this.yaw) * 0.75, this.center.y, this.pos.z + Math.cos(this.yaw) * 0.75);
    this.cooldown -= dt;
    if (this.cooldown <= 0 && near && this.canSee(this.muzzle, victim)) {
      this.cooldown = 2.4;
      this.burst = 3;
      this.burstTimer = 0;
    }
    if (this.burst > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burst--;
        this.burstTimer = 0.22;
        const aim = new THREE.Vector3(victim.pos.x, victim.pos.y + 0.8, victim.pos.z).sub(this.muzzle).normalize();
        this.ctx.shots.fire(this.muzzle, aim.multiplyScalar(10), { damage: 12 });
        sfx.enemyShot();
      }
    }
    // The eye swells before a burst.
    const s = 1 + Math.max(0, 0.5 - this.cooldown) * 0.5;
    this.head.scale.setScalar(s);
  }
}

/** A winged Reaverbot that circles overhead and dives at you. */
export class Flyer extends Enemy {
  readonly radius = 0.45;
  private wings: THREE.Object3D[] = [];
  private angle = Math.random() * Math.PI * 2;
  private diveTimer = 2 + Math.random() * 2;
  private diving = 0;
  private vel = new THREE.Vector3();
  private time = Math.random() * 10;
  private home: THREE.Vector3;

  constructor(ctx: EnemyContext, spawn: THREE.Vector3) {
    super(ctx, spawn.clone().setY(spawn.y + 2.6), 2, 20);
    this.home = this.pos.clone();
    this.contact = 8;
    const core = toonMesh(new THREE.SphereGeometry(0.32, 14, 10), BONE);
    const ridge = toonMesh(new THREE.ConeGeometry(0.16, 0.4, 6), TRIM);
    ridge.rotation.x = -Math.PI / 2;
    ridge.position.set(0, 0, -0.35);
    this.root.add(core, ridge);
    eye(this.root, 0.12, 0.3);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.x = s * 0.25;
      const wing = toonMesh(new THREE.BoxGeometry(0.75, 0.04, 0.42), TRIM);
      wing.position.x = s * 0.4;
      const tip = toonMesh(new THREE.BoxGeometry(0.3, 0.04, 0.25), BONE);
      tip.position.x = s * 0.85;
      pivot.add(wing, tip);
      this.root.add(pivot);
      this.wings.push(pivot);
    }
  }

  protected onHit(dir: THREE.Vector3) {
    this.vel.addScaledVector(dir, 4);
    this.diving = 0;
  }

  protected think(dt: number, victim: Victim | null) {
    this.time += dt;
    const flap = Math.sin(this.time * (this.diving > 0 ? 8 : 16));
    this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * flap * 0.6));

    const goal = new THREE.Vector3();
    if (victim && this.awake) {
      this.faceToward(victim.pos, dt * 5);
      this.diveTimer -= dt;
      if (this.diving > 0) {
        this.diving -= dt;
      } else if (this.diveTimer <= 0) {
        this.diveTimer = 2.5 + Math.random() * 1.5;
        this.diving = 0.9;
        this.vel.set(victim.pos.x, victim.pos.y + 0.8, victim.pos.z).sub(this.pos).normalize().multiplyScalar(10);
        sfx.enemyShot();
      }
      this.angle += dt * 0.9;
      goal.set(victim.pos.x + Math.cos(this.angle) * 4.5, victim.pos.y + 2.8, victim.pos.z + Math.sin(this.angle) * 4.5);
    } else {
      goal.copy(this.home).setY(this.home.y + Math.sin(this.time * 2) * 0.3);
    }
    if (this.diving <= 0) {
      const want = goal.sub(this.pos).multiplyScalar(1.6).clampLength(0, 6);
      this.vel.lerp(want, Math.min(1, dt * 3));
    }
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    if (this.ctx.world.sphereHits(this.pos, 0.4)) {
      this.pos.copy(prev);
      this.vel.multiplyScalar(-0.3);
      this.diving = 0;
    }
    this.center.copy(this.pos);
    // root origin is the body centre for flyers
    this.root.rotation.x = this.diving > 0 ? 0.5 : Math.sin(this.time * 2) * 0.1;
  }
}
