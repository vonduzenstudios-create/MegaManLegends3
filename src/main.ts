import * as THREE from 'three';
import { Input } from './engine/input';
import { CollisionWorld } from './engine/collision';
import { unlockAudio } from './engine/audio';
import { Player } from './game/player';
import { CameraRig } from './game/cameraRig';
import { Projectiles } from './game/projectiles';
import { Effects } from './game/effects';
import { Can } from './game/can';
import { TrainingDrone } from './game/dummy';
import { buildTestArea } from './game/testArea';
import type { Kickable, Target } from './game/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

// Lighting: soft sky fill plus a sun that casts shadows around the player.
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -25;
sun.shadow.camera.right = sun.shadow.camera.top = 25;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-20, 40, -15);

const world = new CollisionWorld();
buildTestArea(scene, world);

const effects = new Effects(scene);
const targets: Target[] = [];
const kickables: Kickable[] = [];
const projectiles = new Projectiles(scene, world, effects, () => targets);
const player = new Player({ world, projectiles, effects, targets, kickables });
scene.add(player.rig.root);

const can = new Can(world, new THREE.Vector3(2, 0, 4));
scene.add(can.group);
kickables.push(can);

const drones = [new THREE.Vector3(-6, 2.2, 18), new THREE.Vector3(4, 2.6, 22), new THREE.Vector3(12, 5.5, 22)].map(
  (p) => new TrainingDrone(effects, p),
);
for (const d of drones) {
  scene.add(d.group);
  targets.push(d);
}

const input = new Input(canvas);
const cam = new CameraRig(camera, world);

// --- HUD ---
const startEl = document.getElementById('start')!;
const lockEl = document.getElementById('lock-reticle')!;
const lifeEl = document.getElementById('life-fill')!;
canvas.addEventListener('mousedown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('gamepadconnected', () => unlockAudio());

function updateHud() {
  startEl.style.display = input.pointerLocked || input.gamepadConnected ? 'none' : 'block';
  lifeEl.style.width = `${(player.life / player.maxLife) * 100}%`;
  if (player.lockTarget) {
    const p = player.lockTarget.center.clone().project(camera);
    lockEl.style.display = p.z < 1 ? 'block' : 'none';
    lockEl.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    lockEl.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
  } else {
    lockEl.style.display = 'none';
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Main loop: variable frame time split into small physics steps ---
const MAX_STEP = 1 / 120;
let last = performance.now();

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  const steps = Math.max(1, Math.ceil(elapsed / MAX_STEP));
  const dt = elapsed / steps;

  // Poll once per frame so press edges aren't lost between steps.
  const state = input.poll(elapsed);
  for (let i = 0; i < steps; i++) {
    const stepInput = i === 0 ? state : { ...state, lookX: 0, lookY: 0, jump: false, kick: false, firePressed: false };
    cam.update(dt, stepInput, player.pos, player.lockTarget);
    player.update(dt, stepInput, cam.yaw, cam.forward, cam.aimPoint());
    can.nudge(player.pos, player.vel);
    can.update(dt);
    for (const d of drones) d.update(dt, player.pos);
    projectiles.update(dt);
    effects.update(dt);
  }

  sun.position.copy(player.pos).add(SUN_OFFSET);
  sun.target.position.copy(player.pos);

  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at things from the dev console.
Object.assign(window, { game: { scene, player, can, drones, world, input, cam } });
