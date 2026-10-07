import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toon } from '../engine/toon';
import type { AnimState, PlayerRig } from './playerModel';

/**
 * Zero, from a purchased rigged model (public/models/zero.glb, made from
 * the FBX by tools/convert-zero.mjs). It is the one piece of art in the
 * game that isn't generated in code.
 *
 * The model ships with its own animation clips (idle, run, jump, landing,
 * attacks). ZeroAnimator plays and crossfades those, then layers code-driven
 * motion on top: a lean into acceleration, the head tracking the lock-on
 * target, hair that swings with a spring, and the game's aim and kick poses
 * borrowed from the PlayerRig proxy joints the rest of the game animates.
 */

const HEIGHT = 1.7;
const OUTLINE = 0.018;

/** Proxy joints the animator may borrow, and the bones they drive. */
const BONES = {
  torso: 'mixamorigSpine',
  head: 'mixamorigHead',
  armL: 'mixamorigLeftArm',
  armR: 'mixamorigRightArm',
  forearmL: 'mixamorigLeftForeArm',
  forearmR: 'mixamorigRightForeArm',
  legL: 'mixamorigLeftUpLeg',
  legR: 'mixamorigRightUpLeg',
  shinL: 'mixamorigLeftLeg',
  shinR: 'mixamorigRightLeg',
} as const;
type Joint = keyof typeof BONES;

const HAIR = ['mixamorigHair001', 'mixamorigHair002', 'mixamorigHair003'];

// The model's eye decal pointed at a texture that didn't ship with the FBX.
const EYE_COLOR = 0x2a8a3e;

let template: THREE.Object3D | null = null;
let clips: THREE.AnimationClip[] = [];
const waiting: Array<() => void> = [];
{
  const loader = new GLTFLoader();
  const onLoad = (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => {
    template = gltf.scene;
    clips = gltf.animations;
    for (const fn of waiting.splice(0)) fn();
  };
  // Single-file builds (the shareable test page can't fetch files) embed
  // the model as base64 on the page; otherwise it's a normal asset.
  const inline = (window as { __ZERO_GLB?: string }).__ZERO_GLB;
  if (inline) {
    const bytes = Uint8Array.from(atob(inline), (c) => c.charCodeAt(0));
    loader.parse(bytes.buffer, '', onLoad, (e) => console.error(e));
  } else {
    loader.load(`${import.meta.env.BASE_URL}models/zero.glb`, onLoad);
  }
}

function whenLoaded(fn: () => void) {
  if (template) fn();
  else waiting.push(fn);
}

const outlineMaterial = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a24, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.thickness = { value: OUTLINE };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float thickness;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        // Push the skinned hull out along its normal in view space, scaled
        // with distance like the outlines on the code-built meshes.
        vec3 outlineN = normalize(normalMatrix * objectNormal);
        mvPosition.xyz += outlineN * thickness * clamp(-mvPosition.z * 0.12, 0.6, 3.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  return mat;
})();

function group(parent: THREE.Object3D) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

export function buildZeroModel(): PlayerRig {
  const root = new THREE.Group();
  // Proxy joints, arranged like the code-built heroes so the animator and
  // the muzzle work before the model has finished loading.
  const body = group(root);
  body.position.y = 0.88;
  body.userData.baseY = 0.88;
  const torso = group(body);
  const head = group(torso);
  const armL = group(torso);
  const armR = group(torso);
  const forearmL = group(armL);
  const forearmR = group(armR);
  const legL = group(body);
  const legR = group(body);
  const shinL = group(legL);
  const shinR = group(legR);
  const muzzle = new THREE.Object3D();
  forearmL.add(muzzle);
  armL.position.set(0.2, 0.4, 0);
  armR.position.set(-0.2, 0.4, 0);
  forearmL.position.y = forearmR.position.y = -0.25;
  muzzle.position.y = -0.3;

  const rig: PlayerRig = { root, body, torso, head, armL, armR, forearmL, forearmR, legL, legR, shinL, shinR, muzzle };
  whenLoaded(() => attachModel(rig));
  return rig;
}

function attachModel(rig: PlayerRig) {
  const model = cloneSkinned(template!);
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });

  // Fit to game scale: feet on the ground, HEIGHT tall, facing +Z.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = HEIGHT / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  rig.root.add(model);

  // Cel-shade: swap every material for the shared toon ramp and give each
  // skinned mesh an inverted-hull twin for the ink outline.
  for (const mesh of skinned) {
    const mats = ([] as THREE.Material[]).concat(mesh.material);
    const toonMats = mats.map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      return src.name.startsWith('Material') ? toon(EYE_COLOR) : toon(src.color);
    });
    mesh.material = Array.isArray(mesh.material) ? toonMats : toonMats[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    // A single material draws the whole geometry, ignoring its groups.
    const hull = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial);
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.frustumCulled = false;
    hull.raycast = () => {};
    mesh.parent!.add(hull);
    hull.position.copy(mesh.position);
    hull.quaternion.copy(mesh.quaternion);
    hull.scale.copy(mesh.scale);
  }

  const bone = (name: string) => {
    const b = model.getObjectByName(name);
    if (!b) throw new Error(`zero.glb is missing bone ${name}`);
    return b as THREE.Bone;
  };

  // Drop the arms from the T-pose to hang at the sides, so the proxy "rest"
  // matches the code-built heroes (arms down, rotation 0).
  for (const [arm, fore, side] of [
    ['mixamorigLeftArm', 'mixamorigLeftForeArm', 1],
    ['mixamorigRightArm', 'mixamorigRightForeArm', -1],
  ] as const) {
    rig.root.updateMatrixWorld(true);
    const a = bone(arm);
    const from = bone(fore).getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
    const to = new THREE.Vector3(side * 0.2, -1, 0).normalize();
    rotateInRootSpace(rig.root, a, new THREE.Quaternion().setFromUnitVectors(from, to));
  }
  rig.root.updateMatrixWorld(true);

  // Muzzle just past the left palm, riding on the hand bone.
  const hand = bone('mixamorigLeftHand');
  const handPos = hand.getWorldPosition(new THREE.Vector3());
  const elbow = bone('mixamorigLeftForeArm').getWorldPosition(new THREE.Vector3());
  const tip = handPos.clone().addScaledVector(handPos.clone().sub(elbow).normalize(), 0.1);
  hand.add(rig.muzzle);
  rig.muzzle.position.copy(hand.worldToLocal(tip));

  const animator = new ZeroAnimator(rig, model, bone);
  rig.drive = (state, dt) => animator.update(state, dt);
}

/** How fast a clip's weight moves toward its target, in seconds. */
const FADE = { ground: 0.18, jump: 0.1, land: 0.08, kick: 0.07 } as const;
type Main = keyof typeof FADE;
const IDLE_LOOK_AFTER = 6;
/** Start the landing clip past its airborne wind-up, at the moment of impact. */
const LAND_START = 0.42;

interface Override {
  proxy: THREE.Object3D;
  bone: THREE.Bone;
  restLocal: THREE.Quaternion;
  parentRest: THREE.Quaternion;
  parentRestInv: THREE.Quaternion;
}

interface HairLink {
  bone: THREE.Bone;
  /** Swing angles (about root X and Z) and their velocities. */
  ax: number;
  az: number;
  vx: number;
  vz: number;
  /** How much of the head's motion this link feels. */
  gain: number;
}

class ZeroAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly weights = new Map<string, number>();
  private readonly overrides = new Map<Joint, Override>();
  private readonly hair: HairLink[] = [];
  private readonly spine: THREE.Bone;
  private readonly spine1: THREE.Bone;
  private readonly headBone: THREE.Bone;
  private readonly shoulderL: THREE.Bone;
  private readonly shoulderLRest: THREE.Quaternion;

  private main: Main = 'ground';
  private wasGrounded = true;
  private idleTime = 0;
  private looking = false;
  private aimW = 0;
  private kickW = 0;
  private hurtW = 0;
  private leanPitch = 0;
  private leanRoll = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private readonly prevVel = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();

  constructor(
    private readonly rig: PlayerRig,
    model: THREE.Object3D,
    bone: (name: string) => THREE.Bone,
  ) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      this.actions.set(clip.name, action);
      this.weights.set(clip.name, 0);
    }
    for (const name of ['jump', 'land', 'idleLook']) {
      const a = this.actions.get(name);
      if (a) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('idleLook')) this.looking = false;
    });
    this.weights.set('idle', 1);

    // Rest orientations relative to the rig root, for retargeting proxies.
    rig.root.updateMatrixWorld(true);
    const rootInv = rig.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const restInRoot = (o: THREE.Object3D) => rootInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    for (const joint of Object.keys(BONES) as Joint[]) {
      const b = bone(BONES[joint]);
      const parentRest = restInRoot(b.parent!);
      this.overrides.set(joint, {
        proxy: rig[joint],
        bone: b,
        restLocal: b.quaternion.clone(),
        parentRest,
        parentRestInv: parentRest.clone().invert(),
      });
    }
    this.spine = bone('mixamorigSpine');
    this.spine1 = bone('mixamorigSpine1');
    this.headBone = bone('mixamorigHead');
    this.shoulderL = bone('mixamorigLeftShoulder');
    this.shoulderLRest = this.shoulderL.quaternion.clone();
    HAIR.forEach((name, i) => {
      this.hair.push({ bone: bone(name), ax: 0, az: 0, vx: 0, vz: 0, gain: 0.5 + i * 0.45 });
    });
  }

  update(state: AnimState, dt: number) {
    dt = Math.min(dt, 0.05);
    const a = (name: string) => this.actions.get(name)!;

    // --- Which clip leads ---
    if (state.kick >= 0) {
      this.main = 'kick';
    } else if (!state.grounded) {
      if (state.justJumped) {
        a('jump').reset();
        this.main = 'jump';
      } else if (this.main !== 'jump') {
        // Walked off a ledge: skip the crouch and launch, go to flight.
        const j = a('jump').reset();
        j.time = 0.45;
        this.main = 'jump';
      }
    } else if (this.main === 'kick') {
      this.main = 'ground';
    } else if (!this.wasGrounded || this.main === 'jump') {
      if (state.landingSpeed > 5) {
        const l = a('land').reset();
        l.time = LAND_START;
        l.timeScale = 1.6;
        this.main = 'land';
      } else {
        this.main = 'ground';
      }
    } else if (this.main === 'land') {
      const l = a('land');
      if (l.time >= l.getClip().duration - 0.05 || state.speed > 0.35) this.main = 'ground';
    }
    this.wasGrounded = state.grounded;

    // --- Clip weights ---
    const target = new Map<string, number>();
    if (this.main === 'ground') {
      // Idle and run blend by speed; the look-around replaces idle for a while.
      const run = smoothstep(0.08, 0.6, state.speed);
      this.idleTime = run < 0.05 ? this.idleTime + dt : 0;
      if (!this.looking && this.idleTime > IDLE_LOOK_AFTER) {
        this.looking = true;
        this.idleTime = 0;
        a('idleLook').reset();
      }
      if (this.looking && run > 0.2) this.looking = false;
      target.set(this.looking ? 'idleLook' : 'idle', 1 - run);
      target.set('run', run);
      a('run').timeScale = 0.75 + 0.45 * state.speed;
    } else {
      this.looking = false;
      this.idleTime = 0;
      // The kick is the game's own pose, laid over a standing base.
      target.set(this.main === 'kick' ? 'idle' : this.main, 1);
    }
    const fade = FADE[this.main];
    let sum = 0;
    for (const [name, action] of this.actions) {
      const w = approach(this.weights.get(name)!, target.get(name) ?? 0, dt / fade);
      this.weights.set(name, w);
      sum += w;
      action.setEffectiveWeight(w);
    }
    // Keep the weights summing to one so the hips' position isn't scaled.
    if (sum > 1e-4 && Math.abs(sum - 1) > 1e-3) {
      for (const [name, action] of this.actions) action.setEffectiveWeight(this.weights.get(name)! / sum);
    }
    this.mixer.update(dt);

    // --- Layers on top of the clips ---
    const yaw = this.rig.root.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Velocity and acceleration in the character's own frame (z forward).
    const vx = state.vel.x * cos - state.vel.z * sin;
    const vz = state.vel.x * sin + state.vel.z * cos;
    const ax = dt > 0 ? ((state.vel.x - this.prevVel.x) * cos - (state.vel.z - this.prevVel.z) * sin) / dt : 0;
    const az = dt > 0 ? ((state.vel.x - this.prevVel.x) * sin + (state.vel.z - this.prevVel.z) * cos) / dt : 0;
    this.prevVel.copy(state.vel);

    this.aimW = approach(this.aimW, state.aiming && state.kick < 0 && !state.hurt && !state.dead ? 1 : 0, dt / 0.08);
    this.kickW = approach(this.kickW, state.kick >= 0 ? 1 : 0, dt / 0.06);
    this.hurtW = approach(this.hurtW, state.hurt || state.dead ? 1 : 0, dt / 0.08);

    this.lean(state, vz, ax, az, dt);
    this.look(state, yaw, dt);
    this.borrowProxies();
    this.swingHair(state, vx, vz, dt);
  }

  /** Lean the torso into acceleration, bank into turns, pitch with the jump. */
  private lean(state: AnimState, vz: number, ax: number, az: number, dt: number) {
    let pitch = state.speed * 0.08 + THREE.MathUtils.clamp(az * 0.012, -0.22, 0.22);
    if (!state.grounded) pitch += THREE.MathUtils.clamp(-state.vel.y * 0.018, -0.12, 0.2);
    pitch *= 1 - this.hurtW;
    const roll = THREE.MathUtils.clamp(-ax * 0.014 - state.yawRate * Math.min(1, Math.abs(vz) / 3) * 0.05, -0.25, 0.25);
    this.leanPitch = damp(this.leanPitch, pitch, 9, dt);
    this.leanRoll = damp(this.leanRoll, roll, 7, dt);
    this.spine.parent!.updateWorldMatrix(true, false);
    this.rotateInRoot(this.spine, this.leanPitch * 0.55, this.leanRoll * 0.6);
    this.spine.updateWorldMatrix(false, false);
    this.rotateInRoot(this.spine1, this.leanPitch * 0.45, this.leanRoll * 0.4);
  }

  /** Turn the head (and a little of the chest) toward the lock-on target. */
  private look(state: AnimState, yaw: number, dt: number) {
    let ty = 0;
    let tp = 0;
    if (state.lookDir && this.kickW < 0.5 && this.hurtW < 0.5) {
      const d = this.tmpV.copy(state.lookDir);
      const flat = Math.hypot(d.x, d.z);
      const rel = Math.atan2(Math.sin(Math.atan2(d.x, d.z) - yaw), Math.cos(Math.atan2(d.x, d.z) - yaw));
      ty = THREE.MathUtils.clamp(rel, -1.0, 1.0);
      tp = THREE.MathUtils.clamp(Math.atan2(d.y, Math.max(flat, 0.3)), -0.5, 0.4);
    }
    this.lookYaw = damp(this.lookYaw, ty, 8, dt);
    this.lookPitch = damp(this.lookPitch, tp, 8, dt);
    if (Math.abs(this.lookYaw) < 1e-3 && Math.abs(this.lookPitch) < 1e-3) return;
    this.spine1.updateWorldMatrix(true, false);
    this.rotateInRoot(this.spine1, 0, 0, this.lookYaw * 0.25);
    this.headBone.parent!.updateWorldMatrix(true, false);
    this.rotateInRoot(this.headBone, -this.lookPitch * 0.8, 0, this.lookYaw * 0.75);
  }

  /** Replace clip motion with the game's proxy joints where the game needs them. */
  private borrowProxies() {
    const o = (joint: Joint, w: number) => {
      if (w <= 1e-3) return;
      const b = this.overrides.get(joint)!;
      // New local = parentRest⁻¹ · proxyRotation · parentRest · restLocal
      this.tmpQ.copy(b.parentRestInv).multiply(b.proxy.quaternion).multiply(b.parentRest).multiply(b.restLocal);
      b.bone.quaternion.slerp(this.tmpQ, w);
    };
    // Buster arm points where the player aims; the shoulder settles so the
    // arm's retarget starts from the pose it was measured in.
    if (this.aimW > 1e-3) this.shoulderL.quaternion.slerp(this.shoulderLRest, this.aimW);
    o('armL', this.aimW);
    o('forearmL', this.aimW);
    // Kick: legs, lean and the counter-swinging arms all come from the game.
    o('legR', this.kickW);
    o('shinR', this.kickW);
    o('legL', this.kickW);
    o('shinL', this.kickW);
    o('torso', this.kickW);
    o('armR', this.kickW);
    o('forearmR', this.kickW);
    if (this.aimW < 0.5) {
      o('armL', this.kickW);
      o('forearmL', this.kickW);
    }
    // Flinch: lean back, arms thrown up.
    o('torso', this.hurtW);
    o('armL', this.hurtW);
    o('armR', this.hurtW);
    o('forearmL', this.hurtW);
    o('forearmR', this.hurtW);
    o('head', this.hurtW * 0.5);
  }

  /** Hair trails the head's motion on a damped spring, link by link. */
  private swingHair(state: AnimState, vx: number, vz: number, dt: number) {
    // Where the hair wants to hang: back when running forward, out to the
    // side through turns, up when falling, down-and-back on the way up.
    const rise = state.grounded ? 0 : state.vel.y;
    const baseX = -THREE.MathUtils.clamp(vz * 0.07 + rise * 0.05, -0.3, 0.6);
    const baseZ = THREE.MathUtils.clamp(-vx * 0.07 + state.yawRate * 0.07, -0.45, 0.45);
    for (const h of this.hair) {
      const tx = baseX * h.gain;
      const tz = baseZ * h.gain;
      const k = 70;
      const c = 9;
      h.vx += (k * (tx - h.ax) - c * h.vx) * dt;
      h.vz += (k * (tz - h.az) - c * h.vz) * dt;
      h.ax += h.vx * dt;
      h.az += h.vz * dt;
      h.bone.parent!.updateWorldMatrix(true, false);
      this.rotateInRoot(h.bone, h.ax, h.az);
    }
  }

  /**
   * Adds a rotation expressed in the rig root's frame (x = pitch, z = roll,
   * y = yaw) to a bone, whatever its parents are doing. The bone's parent
   * must have an up-to-date world matrix.
   */
  private rotateInRoot(b: THREE.Bone, x: number, z: number, y = 0) {
    const rootQ = this.rig.root.getWorldQuaternion(this.tmpQ);
    const delta = this.tmpQ2.setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    // delta in root space -> world space
    delta.premultiply(rootQ).multiply(rootQ.clone().invert());
    const parentWorld = b.parent!.getWorldQuaternion(new THREE.Quaternion());
    // local' = parentWorld⁻¹ · deltaWorld · parentWorld · local
    b.quaternion.premultiply(parentWorld).premultiply(delta).premultiply(parentWorld.invert());
  }
}

function rotateInRootSpace(root: THREE.Object3D, b: THREE.Object3D, delta: THREE.Quaternion) {
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const world = b.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = b.parent!.getWorldQuaternion(new THREE.Quaternion());
  // delta is in root space; convert to world, apply, then back to local.
  const deltaWorld = rootQ.clone().multiply(delta).multiply(rootQ.clone().invert());
  b.quaternion.copy(parentWorld.invert().multiply(deltaWorld.multiply(world)));
}

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

/** Frame-rate independent exponential ease toward a target. */
function damp(v: number, target: number, rate: number, dt: number) {
  return target + (v - target) * Math.exp(-rate * dt);
}

function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
