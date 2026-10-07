import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import type { InputState } from '../engine/input';
import { sfx } from '../engine/audio';
import type { PlayerRig } from './playerModel';
import type { CharacterDef } from './characters';
import type { Projectiles } from './projectiles';
import type { Effects } from './effects';
import type { Kickable, Target } from './types';

const GROUND_ACCEL = 45;
const AIR_ACCEL = 14;
const GRAVITY = 30;
const JUMP_CUT = 0.45;
const COYOTE_TIME = 0.1;
const TURN_SPEED = 14;
const RADIUS = 0.32;
const HEIGHT = 1.5;
const FIRE_INTERVAL = 0.14;
const MAX_SHOTS = 4;
const KICK_TIME = 0.42;
const KICK_HIT_AT = 0.12;
const LOCK_RANGE = 26;

export interface PlayerContext {
  world: CollisionWorld;
  projectiles: Projectiles;
  effects: Effects;
  targets: Target[];
  kickables: Kickable[];
}

export class Player {
  readonly rig: PlayerRig;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  life: number;
  readonly maxLife: number;
  lockTarget: Target | null = null;

  private coyote = 0;
  private fireCooldown = 0;
  private aimTimer = 0;
  private kickTimer = 0;
  private kickHitDone = false;
  private runPhase = 0;
  private aimPitch = 0;
  private wasLockHeld = false;
  private readonly tmp = new THREE.Vector3();

  constructor(private ctx: PlayerContext, readonly def: CharacterDef) {
    this.rig = def.build();
    this.life = this.maxLife = def.maxLife;
  }

  /** Put the player somewhere new (spawn, respawn). */
  place(pos: THREE.Vector3, yaw: number) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.animate(0);
  }

  get head() {
    return this.tmp.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /**
   * @param camYaw camera yaw; movement is relative to it
   * @param aimPoint world point under the crosshair
   */
  update(dt: number, input: InputState, camYaw: number, camForward: THREE.Vector3, aimPoint: THREE.Vector3) {
    this.updateLock(input, camForward);

    // --- Movement ---
    const camF = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const camR = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const wish = camF.multiplyScalar(input.moveY).addScaledVector(camR, input.moveX);
    const kicking = this.kickTimer > 0;
    const speed = this.def.runSpeed * (kicking && this.grounded ? 0.15 : 1);
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const targetVX = wish.x * speed;
    const targetVZ = wish.z * speed;
    this.vel.x = approach(this.vel.x, targetVX, accel * dt);
    this.vel.z = approach(this.vel.z, targetVZ, accel * dt);

    // --- Jumping (coyote time + variable height) ---
    this.coyote = this.grounded ? COYOTE_TIME : this.coyote - dt;
    if (input.jump && this.coyote > 0 && !kicking) {
      this.vel.y = this.def.jumpSpeed;
      this.coyote = 0;
      this.grounded = false;
      sfx.jump();
    }
    if (!input.jumpHeld && this.vel.y > 0 && !this.grounded) this.vel.y *= Math.pow(JUMP_CUT, dt * 20);
    this.vel.y -= GRAVITY * dt;

    const res = this.ctx.world.moveCylinder(this.pos, this.vel, RADIUS, HEIGHT, dt, this.grounded);
    if (res.landingSpeed > 6) {
      sfx.land();
      this.ctx.effects.dust(this.pos);
    }
    this.grounded = res.grounded;

    // --- Facing ---
    let faceYaw: number | null = null;
    if (this.lockTarget) {
      faceYaw = Math.atan2(this.lockTarget.center.x - this.pos.x, this.lockTarget.center.z - this.pos.z);
    } else if (this.aimTimer > 0) {
      faceYaw = camYaw;
    } else if (wish.lengthSq() > 0.01) {
      faceYaw = Math.atan2(wish.x, wish.z);
    }
    if (faceYaw !== null && !kicking) this.yaw = turnToward(this.yaw, faceYaw, TURN_SPEED * dt);

    // --- Buster ---
    this.fireCooldown -= dt;
    this.aimTimer -= dt;
    if (input.fire) this.aimTimer = 0.5;
    if (input.fire && this.fireCooldown <= 0 && !kicking) this.fireWeapon(aimPoint);
    const aimGoal = this.lockTarget ? this.lockTarget.center : aimPoint;
    const flat = Math.hypot(aimGoal.x - this.pos.x, aimGoal.z - this.pos.z);
    this.aimPitch = Math.atan2(aimGoal.y - (this.pos.y + 1.1), Math.max(flat, 0.5));

    // --- Kick ---
    if (input.kick && !kicking) {
      this.kickTimer = KICK_TIME;
      this.kickHitDone = false;
      if (this.def.melee === 'swing') sfx.swing();
      else sfx.kick();
    }
    if (this.kickTimer > 0) {
      this.kickTimer -= dt;
      if (!this.kickHitDone && KICK_TIME - this.kickTimer >= KICK_HIT_AT) {
        this.kickHitDone = true;
        this.doKickHit();
      }
    }

    this.animate(dt);
  }

  private fireWeapon(aimPoint: THREE.Vector3) {
    this.rig.root.updateMatrixWorld(true);
    const muzzle = this.rig.muzzle.getWorldPosition(new THREE.Vector3());
    const goal = this.lockTarget ? this.lockTarget.center : aimPoint;
    const dir = goal.clone().sub(muzzle);
    // Never fire backwards out of the arm if the crosshair is behind us.
    if (dir.dot(this.forward) < 0.2) {
      const y = dir.normalize().y;
      dir.copy(this.forward).setY(y);
    }
    if (this.ctx.projectiles.count >= MAX_SHOTS) return;
    this.fireCooldown = FIRE_INTERVAL;
    this.ctx.projectiles.fire(muzzle, dir, { homing: this.lockTarget });
  }

  private updateLock(input: InputState, camForward: THREE.Vector3) {
    if (input.lockOn && !this.wasLockHeld) {
      // Choose the target closest to where the camera is looking.
      let best: Target | null = null;
      let bestScore = Infinity;
      for (const t of this.ctx.targets) {
        if (!t.alive) continue;
        const to = t.center.clone().sub(this.pos);
        const dist = to.length();
        if (dist > LOCK_RANGE) continue;
        const facing = to.setY(0).normalize().dot(new THREE.Vector3(camForward.x, 0, camForward.z).normalize());
        if (facing < 0.3) continue;
        const score = dist * (2 - facing);
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      }
      this.lockTarget = best;
      if (best) sfx.lockOn();
    }
    if (!input.lockOn) this.lockTarget = null;
    if (this.lockTarget && (!this.lockTarget.alive || this.lockTarget.center.distanceTo(this.pos) > LOCK_RANGE * 1.3)) {
      this.lockTarget = null;
    }
    this.wasLockHeld = input.lockOn;
  }

  private doKickHit() {
    const f = this.forward;
    const swing = this.def.melee === 'swing';
    const hitPos = this.pos.clone().addScaledVector(f, swing ? 0.75 : 0.55).setY(this.pos.y + (swing ? 0.7 : 0.35));
    const hitR = swing ? 0.8 : 0.55;
    const dir = f.clone().setY(swing ? 0.35 : 0.55).normalize();
    for (const k of this.ctx.kickables) {
      if (k.center.distanceTo(hitPos) < hitR + k.radius) k.kick(dir, swing ? 13 : 11);
    }
    for (const t of this.ctx.targets) {
      if (t.alive && t.center.distanceTo(hitPos) < hitR + t.radius) {
        t.hit(swing ? 3 : 2, dir);
        this.ctx.effects.burst(t.center, { color: 0xffffff, count: 10 });
      }
    }
  }

  private animate(dt: number) {
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;

    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const run = Math.min(hSpeed / this.def.runSpeed, 1);
    this.runPhase += dt * (4 + hSpeed * 1.6);
    const s = Math.sin(this.runPhase);
    const c = Math.cos(this.runPhase);

    let legL = -s * 0.9 * run;
    let legR = s * 0.9 * run;
    let kneeL = Math.max(0, c) * 1.2 * run;
    let kneeR = Math.max(0, -c) * 1.2 * run;
    let armL = s * 0.7 * run;
    let armR = -s * 0.7 * run;
    let elbowL = -0.3 - 0.4 * run;
    let elbowR = -0.3 - 0.4 * run;
    let bob = Math.abs(c) * 0.06 * run;
    let lean = 0.18 * run;

    if (!this.grounded) {
      legL = -0.5;
      legR = 0.3;
      kneeL = 0.9;
      kneeR = 0.4;
      armL = -0.4;
      armR = 0.6;
      bob = 0;
      lean = 0.05;
    }

    if (this.kickTimer > 0 && this.def.melee === 'swing') {
      // Overhead wrench swing with the right arm.
      const t = 1 - this.kickTimer / KICK_TIME;
      const swing = t < 0.25 ? -t / 0.25 : -1 + Math.min(1, (t - 0.25) / 0.3) * 2.2;
      armR = -Math.PI * 0.5 + swing * 1.6;
      elbowR = -0.2;
      lean = 0.25 * Math.max(0, swing);
      legL = -0.3;
      legR = 0.3;
    } else if (this.kickTimer > 0) {
      const t = 1 - this.kickTimer / KICK_TIME;
      const swing = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      legR = 0.5 - swing * 2.1;
      kneeR = 0.9 * (1 - swing);
      legL = 0.15;
      kneeL = 0.2;
      lean = -0.25 * swing;
      armR = 0.6 * swing;
      armL = -0.5 * swing;
    }

    // Buster arm points at the target while aiming.
    const aiming = (this.aimTimer > 0 || this.lockTarget !== null) && this.kickTimer <= 0;
    if (aiming) {
      armL = -Math.PI / 2 - this.aimPitch;
      elbowL = 0;
    }
    if (r.ponytail) {
      // Hair streams out behind with speed and bounces with the run.
      const target = -0.2 - run * 0.7 - (this.grounded ? 0 : 0.4) + Math.sin(this.runPhase * 2) * 0.12 * run;
      r.ponytail.rotation.x = lerp(r.ponytail.rotation.x, -target - 0.3, Math.min(1, dt * 10));
    }

    const k = Math.min(1, dt * 18);
    r.legL.rotation.x = lerp(r.legL.rotation.x, legL, k);
    r.legR.rotation.x = lerp(r.legR.rotation.x, legR, k);
    r.shinL.rotation.x = lerp(r.shinL.rotation.x, kneeL, k);
    r.shinR.rotation.x = lerp(r.shinR.rotation.x, kneeR, k);
    r.armL.rotation.x = lerp(r.armL.rotation.x, armL, aiming ? 1 : k);
    r.armR.rotation.x = lerp(r.armR.rotation.x, armR, k);
    r.forearmL.rotation.x = lerp(r.forearmL.rotation.x, elbowL, aiming ? 1 : k);
    r.forearmR.rotation.x = lerp(r.forearmR.rotation.x, elbowR, k);
    r.armL.rotation.z = 0.12;
    r.armR.rotation.z = -0.12;
    r.body.position.y = (r.body.userData.baseY ?? 0.78) + bob;
    r.torso.rotation.x = lerp(r.torso.rotation.x, lean, k);
    r.head.rotation.x = -r.torso.rotation.x * 0.6;
  }
}

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function turnToward(current: number, target: number, maxStep: number) {
  const d = wrapAngle(target - current);
  return current + Math.sign(d) * Math.min(Math.abs(d), maxStep);
}
