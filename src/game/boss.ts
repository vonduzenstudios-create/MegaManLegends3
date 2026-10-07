import * as THREE from 'three';
import { sfx } from '../engine/audio';
import { toon, toonMesh } from '../engine/toon';
import { BONE, EYE, TRIM, type EnemyContext } from './enemies';
import type { Victim } from './combat';
import type { Target } from './types';

export const BOSS_NAME = 'COLOSSUS REAVERBOT';
const MAX_HP = 150;
const BODY_Y = 3.4;
const RADIUS = 2.4;
const ARMOR = 0x9a8a6a;

type State = 'dormant' | 'intro' | 'walk' | 'stomp' | 'volley' | 'roar' | 'charge' | 'stunned' | 'laser' | 'breaking' | 'dying' | 'dead';

export interface BossHooks {
  /** Spawn a minion beside the boss. */
  summon(pos: THREE.Vector3): void;
  minions(): number;
  defeated(pos: THREE.Vector3): void;
}

/**
 * A giant four-legged Reaverbot guarding the ruin's core.
 *  Phase 1: stomps that send shockwaves along the floor, cannon volleys.
 *  Phase 2: faster; summons hoppers and charges (stuns itself on walls).
 *  Phase 3: armour blown off, glyphs turn red, sweeping eye laser.
 */
export class Boss implements Target {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  readonly radius = RADIUS + 0.2;
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  phase = 1;
  /** Camera shake requested this frame; the caller decays it. */
  shake = 0;
  state: State = 'dormant';

  private yaw = Math.PI;
  private timer = 0;
  private actionStep = 0;
  private vel = new THREE.Vector3();
  private chargeDir = new THREE.Vector3();
  private laserFrom = 0;
  private laserTo = 0;
  private flash = 0;
  private walkPhase = 0;
  private lastAction = '';

  private body = new THREE.Group();
  private head = new THREE.Group();
  private armor = new THREE.Group();
  private legs: THREE.Group[] = [];
  private cannons: THREE.Object3D[] = [];
  private eyeMat: THREE.MeshToonMaterial;
  private glyphMat: THREE.MeshToonMaterial;
  private beam: THREE.Mesh;

  constructor(
    private ctx: EnemyContext,
    private home: THREE.Vector3,
    private hooks: BossHooks,
  ) {
    this.eyeMat = toon(EYE, { emissive: 0xc01810 }).clone();
    this.glyphMat = toon(0x5ae0ff, { emissive: 0x2a9ac0 }).clone();
    this.buildModel();
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.beam.visible = false;
    ctx.scene.add(this.root, this.beam);
    this.reset();
  }

  get alive() {
    return this.state !== 'dormant' && this.state !== 'dying' && this.state !== 'dead';
  }

  get active() {
    return this.state !== 'dormant' && this.state !== 'dead';
  }

  private buildModel() {
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
      const m = toonMesh(geo, color);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const glyph = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.glyphMat);
      m.position.set(x, y, z);
      parent.add(m);
    };

    this.body.position.y = BODY_Y;
    this.root.add(this.body);
    add(this.body, new THREE.BoxGeometry(4.2, 2.2, 5), BONE, 0, 0, 0);
    add(this.body, new THREE.BoxGeometry(3.6, 0.7, 4.4), TRIM, 0, -1.25, 0);
    add(this.body, new THREE.BoxGeometry(3.4, 1.6, 0.6), TRIM, 0, 0.1, -2.6);
    for (const s of [-1, 1]) {
      glyph(this.body, 0.06, 0.16, 4.2, s * 2.12, 0.3, 0);
      glyph(this.body, 0.06, 0.6, 0.16, s * 2.12, -0.2, 1.2);
      glyph(this.body, 0.06, 0.6, 0.16, s * 2.12, -0.2, -1.2);
    }

    // Head with the great eye.
    this.head.position.set(0, 0.1, 2.7);
    this.body.add(this.head);
    const skull = add(this.head, new THREE.SphereGeometry(1.25, 20, 14), BONE, 0, 0, 0.3);
    skull.scale.set(1.1, 0.85, 1);
    add(this.head, new THREE.BoxGeometry(1.8, 0.35, 1.2), TRIM, 0, -0.75, 0.7);
    add(this.head, new THREE.BoxGeometry(2.4, 0.3, 0.9), TRIM, 0, 0.75, 0.6);
    const socket = add(this.head, new THREE.CylinderGeometry(0.7, 0.7, 0.2, 24), TRIM, 0, 0, 1.4);
    socket.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), this.eyeMat);
    lens.scale.z = 0.55;
    lens.position.set(0, 0, 1.52);
    this.head.add(lens);

    // Armour: a bronze carapace with spikes; blown off in phase 3.
    this.body.add(this.armor);
    add(this.armor, new THREE.BoxGeometry(4.6, 0.4, 4.4), ARMOR, 0, 1.3, -0.1);
    for (const s of [-1, 1]) {
      const plate = add(this.armor, new THREE.BoxGeometry(0.35, 1.6, 3.6), ARMOR, s * 2.3, 0.4, -0.1);
      plate.rotation.z = s * -0.12;
    }
    for (let i = 0; i < 3; i++) {
      const spike = add(this.armor, new THREE.ConeGeometry(0.3, 1.0, 6), TRIM, 0, 1.95, -1.4 + i * 1.2);
      spike.rotation.x = -0.4;
    }

    // Shoulder cannons.
    for (const s of [-1, 1]) {
      const c = new THREE.Group();
      c.position.set(s * 1.6, 1.25, 1.4);
      add(c, new THREE.BoxGeometry(0.8, 0.6, 0.8), TRIM, 0, 0, 0);
      const barrel = add(c, new THREE.CylinderGeometry(0.22, 0.26, 1.4, 10), BONE, 0, 0, 0.8);
      barrel.rotation.x = Math.PI / 2;
      this.body.add(c);
      this.cannons.push(c);
    }

    // Four legs: hip pivots on the body corners.
    for (const [x, z] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const hip = new THREE.Group();
      hip.position.set(x * 2.2, -0.6, z * 1.7);
      add(hip, new THREE.SphereGeometry(0.6, 12, 10), TRIM, 0, 0, 0);
      const thigh = add(hip, new THREE.CylinderGeometry(0.42, 0.34, 2.6, 10), BONE, x * 0.35, -1.3, 0);
      thigh.rotation.z = x * 0.25;
      add(hip, new THREE.BoxGeometry(1.1, 0.5, 1.4), TRIM, x * 0.65, -2.6, 0.15);
      this.body.add(hip);
      this.legs.push(hip);
    }
  }

  reset() {
    this.hp = MAX_HP;
    this.phase = 1;
    this.state = 'dormant';
    this.pos.copy(this.home);
    this.yaw = Math.PI;
    this.vel.set(0, 0, 0);
    this.armor.visible = true;
    this.root.visible = true;
    this.beam.visible = false;
    this.glyphMat.color.set(0x5ae0ff);
    this.glyphMat.emissive.set(0x2a9ac0);
    this.eyeMat.emissiveIntensity = 0.1;
    this.body.position.y = BODY_Y - 1.2;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0.4, 0, 0);
    this.sync();
  }

  /** Wake up (the player stepped into the arena). */
  start() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.timer = 2.6;
    sfx.rumble();
  }

  hit(damage: number) {
    if (!this.alive) return;
    const mult = this.state === 'stunned' ? 2 : this.phase === 3 ? 1.25 : 1;
    this.hp = Math.max(0, this.hp - damage * mult);
    this.flash = 0.1;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.timer = 3.2;
      this.beam.visible = false;
      sfx.roar();
      return;
    }
    const phase = this.hp > MAX_HP * (2 / 3) ? 1 : this.hp > MAX_HP / 3 ? 2 : 3;
    if (phase > this.phase) {
      this.phase = phase;
      this.beam.visible = false;
      if (phase === 2) this.begin('roar', 1.6);
      else this.begin('breaking', 2);
    }
  }

  private begin(state: State, time: number) {
    this.state = state;
    this.timer = time;
    this.actionStep = 0;
    this.lastAction = state;
  }

  private forwardVec(yaw = this.yaw) {
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  private local(x: number, y: number, z: number) {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(new THREE.Vector3(x, y, z));
  }

  private chooseAction(victim: Victim) {
    const dist = Math.hypot(victim.pos.x - this.pos.x, victim.pos.z - this.pos.z);
    const options: State[] = [];
    if (dist < 8) options.push('stomp', 'stomp');
    options.push('volley');
    if (this.phase >= 2) {
      options.push('charge');
      if (this.hooks.minions() < 2) options.push('roar');
    }
    if (this.phase === 3) options.push('laser', 'laser');
    let pick = options[Math.floor(Math.random() * options.length)];
    if (pick === this.lastAction && options.length > 1) pick = options.find((o) => o !== pick) ?? pick;
    if (pick === 'stomp') this.begin('stomp', 1.3);
    else if (pick === 'volley') this.begin('volley', this.phase === 3 ? 2.4 : 1.9);
    else if (pick === 'charge') this.begin('charge', 1.0);
    else if (pick === 'roar') this.begin('roar', 1.6);
    else if (pick === 'laser') this.begin('laser', 3.8);
  }

  update(dt: number, victim: Victim | null) {
    if (this.state === 'dead') return;
    this.timer -= dt;
    this.flash -= dt;
    const speed = [0, 2.2, 3.0, 3.6][this.phase];
    let bodyY = BODY_Y;
    let pitch = 0;
    let headPitch = 0;
    let moving = false;

    switch (this.state) {
      case 'dormant':
        bodyY = BODY_Y - 1.2;
        headPitch = 0.4;
        break;

      case 'intro': {
        const t = 1 - Math.max(0, this.timer) / 2.6;
        bodyY = BODY_Y - 1.2 + Math.min(1, t * 2) * 1.2;
        headPitch = 0.4 - Math.min(1, t * 2) * 0.7;
        this.eyeMat.emissiveIntensity = Math.min(1.5, t * 3);
        if (t > 0.5 && this.actionStep === 0) {
          this.actionStep = 1;
          sfx.roar();
          this.shake = 0.5;
        }
        if (this.timer <= 0) this.begin('walk', 1.2);
        break;
      }

      case 'walk':
        if (victim) {
          this.turnToward(victim.pos, dt * 1.6);
          this.vel.copy(this.forwardVec()).multiplyScalar(speed);
          moving = true;
          if (this.timer <= 0) this.chooseAction(victim);
        }
        break;

      case 'stomp': {
        // Rear up, then slam the front legs down.
        const t = 1.3 - this.timer;
        if (t < 0.6) pitch = -(t / 0.6) * 0.3;
        else pitch = Math.max(-0.3 + (t - 0.6) * 3, 0);
        if (t >= 0.7 && this.actionStep === 0) {
          this.actionStep = 1;
          this.slam();
        }
        if (this.phase === 3 && t >= 1.15 && this.actionStep === 1) {
          this.actionStep = 2;
          this.slam();
        }
        if (this.timer <= 0) this.begin('walk', 1.5 + Math.random());
        break;
      }

      case 'volley': {
        if (victim) this.turnToward(victim.pos, dt * 2);
        const rounds = this.phase === 3 ? 3 : 2;
        const t = (this.phase === 3 ? 2.4 : 1.9) - this.timer;
        if (this.actionStep < rounds && t > 0.5 + this.actionStep * 0.55 && victim) {
          this.actionStep++;
          this.fireVolley(victim, this.phase === 3 ? 5 : 3);
        }
        headPitch = -0.1;
        if (this.timer <= 0) this.begin('walk', 1.5 + Math.random());
        break;
      }

      case 'roar': {
        headPitch = -0.5;
        bodyY = BODY_Y + 0.2;
        if (this.actionStep === 0) {
          this.actionStep = 1;
          sfx.roar();
          this.shake = 0.4;
        }
        if (this.timer < 0.6 && this.actionStep === 1) {
          this.actionStep = 2;
          if (this.phase >= 2) {
            for (const s of [-1, 1]) {
              const p = this.local(s * 4.2, 0, 1.5);
              p.y = this.pos.y;
              this.hooks.summon(p);
              this.ctx.effects.burst(p.clone().setY(p.y + 0.6), { color: 0x5ae0ff, count: 16, speed: 4 });
            }
          }
        }
        if (this.timer <= 0) this.begin('walk', 1.2);
        break;
      }

      case 'charge': {
        if (this.actionStep === 0) {
          // Wind up: scrape the floor and lock on.
          if (victim) this.turnToward(victim.pos, dt * 4);
          pitch = 0.12;
          bodyY = BODY_Y - 0.3;
          if (Math.random() < 0.3) this.ctx.effects.dust(this.local(0, 0, -2), 2);
          if (this.timer <= 0.6 && this.timer + dt > 0.6) sfx.charge();
          if (this.timer <= 0) {
            this.actionStep = 1;
            this.timer = 2.2;
            this.chargeDir.copy(this.forwardVec());
          }
        } else {
          pitch = 0.15;
          moving = true;
          this.vel.copy(this.chargeDir).multiplyScalar(16);
          if (Math.random() < 0.6) this.ctx.effects.dust(this.pos, 2);
          if (this.timer <= 0) this.begin('walk', 1.5);
        }
        break;
      }

      case 'stunned':
        bodyY = BODY_Y - 0.8;
        headPitch = 0.5;
        pitch = Math.sin(this.timer * 20) * 0.03;
        if (Math.random() < 0.2) this.ctx.effects.burst(this.local(0, BODY_Y + 2, 2.5), { color: 0xffe680, count: 2, speed: 2, gravity: 0 });
        if (this.timer <= 0) this.begin('walk', 1.0);
        break;

      case 'laser':
        this.laser(dt, victim);
        bodyY = BODY_Y - 1.0;
        pitch = 0.2;
        headPitch = 0.1;
        break;

      case 'breaking': {
        // Armour bursts off; glyphs and eye go red.
        bodyY = BODY_Y + 0.3;
        headPitch = -0.6;
        if (this.actionStep === 0) {
          this.actionStep = 1;
          this.armor.visible = false;
          this.glyphMat.color.set(0xff5040);
          this.glyphMat.emissive.set(0xc02010);
          sfx.explode();
          sfx.roar();
          this.shake = 0.8;
          for (let i = 0; i < 6; i++) {
            const p = this.local((Math.random() - 0.5) * 4, BODY_Y + 1 + Math.random(), (Math.random() - 0.5) * 4);
            this.ctx.effects.explosion(p);
            this.ctx.effects.burst(p, { color: ARMOR, count: 6, speed: 8, size: 0.3, life: 1, gravity: -14 });
          }
        }
        if (this.timer <= 0) this.begin('walk', 0.8);
        break;
      }

      case 'dying': {
        bodyY = BODY_Y - (1 - this.timer / 3.2) * 1.5;
        pitch = (1 - this.timer / 3.2) * 0.3;
        headPitch = 0.6;
        this.eyeMat.emissiveIntensity = Math.max(0, this.timer / 3.2) * (0.5 + Math.random());
        if (Math.random() < dt * 9) {
          const p = this.local((Math.random() - 0.5) * 5, BODY_Y + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 5);
          this.ctx.effects.explosion(p);
          sfx.explode();
          this.shake = Math.max(this.shake, 0.3);
        }
        if (this.timer <= 0) {
          this.state = 'dead';
          this.root.visible = false;
          for (let i = 0; i < 5; i++) this.ctx.effects.explosion(this.local((Math.random() - 0.5) * 3, BODY_Y, (Math.random() - 0.5) * 3));
          this.shake = 1;
          this.hooks.defeated(this.pos.clone());
        }
        break;
      }
    }

    // Movement with collision; a charge into a wall or pillar stuns it.
    if (!moving) {
      this.vel.x *= Math.max(0, 1 - dt * 8);
      this.vel.z *= Math.max(0, 1 - dt * 8);
    }
    this.vel.y = -5;
    const res = this.ctx.world.moveCylinder(this.pos, this.vel, RADIUS, 4.5, dt, true);
    if (this.state === 'charge' && this.actionStep === 1 && res.hitWall) {
      this.begin('stunned', 2.4);
      sfx.stomp();
      this.shake = 1;
      this.ctx.effects.burst(this.local(0, BODY_Y, 3.5), { color: 0xb2aa9a, count: 20, speed: 8, size: 0.25, life: 0.8, gravity: -14 });
    }
    if (moving) this.walkPhase += dt * Math.hypot(this.vel.x, this.vel.z) * 0.9;

    // Body language.
    const k = Math.min(1, dt * 6);
    this.body.position.y += (bodyY + (moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.12 : 0) - this.body.position.y) * k;
    this.body.rotation.x += (pitch - this.body.rotation.x) * k;
    this.head.rotation.x += (headPitch - this.head.rotation.x) * k;
    this.legs.forEach((leg, i) => {
      const swing = moving ? Math.sin(this.walkPhase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 : 0;
      leg.rotation.x += (swing - leg.rotation.x) * k;
    });
    if (this.state !== 'dying' && this.state !== 'intro' && this.state !== 'dormant') {
      this.eyeMat.emissiveIntensity = this.state === 'laser' ? 2.5 : this.phase === 3 ? 1.8 : 1.2;
    }
    this.root.visible = this.state === 'dead' ? false : this.flash <= 0 || Math.floor(this.flash * 40) % 2 === 0;
    this.sync();

    // Keep the player out of the body; charging into you hurts.
    if (victim && this.active) {
      const dx = victim.pos.x - this.pos.x;
      const dz = victim.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = RADIUS + 0.5;
      if (d < reach && victim.pos.y < this.pos.y + 5) {
        if (this.alive) {
          const dmg = this.state === 'charge' && this.actionStep === 1 ? 22 : 8;
          victim.takeDamage(dmg, this.pos.clone().setY(victim.pos.y));
        }
        const nx = d > 1e-3 ? dx / d : 1;
        const nz = d > 1e-3 ? dz / d : 0;
        victim.pos.x = this.pos.x + nx * reach;
        victim.pos.z = this.pos.z + nz * reach;
      }
    }
  }

  private sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    this.center.copy(this.body.localToWorld(new THREE.Vector3(0, 0, 0.8)));
  }

  private turnToward(p: THREE.Vector3, rate: number) {
    const goal = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    const d = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate);
  }

  private slam() {
    const p = this.local(0, 0, 3.2);
    p.y = this.pos.y;
    this.ctx.shots.shockwave(p, { speed: 10 + this.phase, maxRadius: 18, damage: 15 });
    this.ctx.effects.burst(p.clone().setY(p.y + 0.3), { color: 0xd8cfb0, count: 24, speed: 6, size: 0.18, life: 0.6 });
    sfx.stomp();
    this.shake = 0.8;
  }

  private fireVolley(victim: Victim, count: number) {
    for (const c of this.cannons) {
      const muzzle = c.localToWorld(new THREE.Vector3(0, 0, 1.6));
      const aim = new THREE.Vector3(victim.pos.x, victim.pos.y + 0.8, victim.pos.z).sub(muzzle);
      const base = Math.atan2(aim.x, aim.z);
      const flat = Math.hypot(aim.x, aim.z);
      const pitchDir = aim.y / Math.max(flat, 1);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * 0.22;
        const dir = new THREE.Vector3(Math.sin(a), pitchDir, Math.cos(a)).normalize();
        this.ctx.shots.fire(muzzle, dir.multiplyScalar(13), { damage: 12, radius: 0.32, color: 0xff6a30 });
      }
      this.ctx.effects.burst(muzzle, { color: 0xffa040, count: 6, speed: 3 });
    }
    sfx.enemyShot();
    this.shake = Math.max(this.shake, 0.15);
  }

  private laser(dt: number, victim: Victim | null) {
    const windup = 1.2;
    const t = 3.8 - this.timer;
    if (this.actionStep === 0) {
      if (victim) this.turnToward(victim.pos, dt * 2.5);
      if (t > 0.1) {
        this.actionStep = 1;
        sfx.charge();
      }
    }
    if (this.actionStep === 1 && t >= windup) {
      this.actionStep = 2;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.laserFrom = this.yaw - dir * 1.1;
      this.laserTo = this.yaw + dir * 1.1;
    }
    if (this.actionStep === 2) {
      const k = Math.min(1, (t - windup) / 2.2);
      const angle = this.laserFrom + (this.laserTo - this.laserFrom) * k;
      this.yaw = angle;
      this.root.rotation.y = angle;
      // A low beam skimming the floor: jump over it.
      const origin = this.local(0, 0, 3.4);
      origin.y = this.pos.y + 0.7;
      const dir = this.forwardVec(angle);
      const len = this.ctx.world.raycast(origin, dir, 45);
      this.beam.visible = true;
      this.beam.position.copy(origin);
      this.beam.rotation.set(0, angle, 0);
      this.beam.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, len);
      if (Math.random() < 0.5) sfx.laser();
      if (Math.random() < 0.7) this.ctx.effects.burst(origin.clone().addScaledVector(dir, len), { color: 0xff8a6a, count: 2, speed: 3 });
      if (victim) {
        const rel = victim.pos.clone().sub(origin);
        const along = rel.x * dir.x + rel.z * dir.z;
        const side = Math.abs(rel.x * dir.z - rel.z * dir.x);
        if (along > 0 && along < len && side < 0.55 && victim.pos.y < origin.y + 0.25) {
          victim.takeDamage(16, origin.clone().addScaledVector(dir, along - 1));
        }
      }
      if (k >= 1) {
        this.beam.visible = false;
        this.begin('walk', 1.6);
      }
    }
  }
}
