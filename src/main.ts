import * as THREE from 'three';
import { Input, type InputState } from './engine/input';
import { CollisionWorld } from './engine/collision';
import { sfx, unlockAudio } from './engine/audio';
import { Music } from './engine/music';
import { Ambience } from './engine/ambience';
import { Player } from './game/player';
import { CameraRig } from './game/cameraRig';
import { Projectiles } from './game/projectiles';
import { Effects } from './game/effects';
import { Can } from './game/can';
import { buildLevel } from './game/level';
import { buildTownsfolk } from './game/townsfolk';
import { Npc, TALK_RANGE } from './game/npc';
import { marketTheme } from './game/songs';
import { CHARACTERS, type CharacterId } from './game/characters';
import { buildRollModel } from './game/rollModel';
import type { Kickable, Target } from './game/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

// Lighting: soft sky fill plus a sun that casts shadows around the player.
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
sun.shadow.camera.right = sun.shadow.camera.top = 30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-25, 50, -18);

const world = new CollisionWorld();
const level = buildLevel(scene, world);

const effects = new Effects(scene);
const targets: Target[] = [];
const kickables: Kickable[] = [];
const projectiles = new Projectiles(scene, world, effects, () => targets);

const can = new Can(world, level.canStart);
scene.add(can.group);
kickables.push(can);

const npcs: Npc[] = buildTownsfolk(world);
for (const n of npcs) scene.add(n.rig.root);
const kid = npcs.find((n) => n.name === 'Kid');

const input = new Input(canvas);
const cam = new CameraRig(camera, world);
const music = new Music();
const ambience = new Ambience();

// --- HUD elements ---
const $ = (id: string) => document.getElementById(id)!;
const startEl = $('start');
const lockEl = $('lock-reticle');
const lifeEl = $('life-fill');
const promptEl = $('prompt');
const dialogEl = $('dialog');
const dialogName = $('dialog-name');
const dialogText = $('dialog-text');
const areaEl = $('area-name');
const selectEl = $('select');
const hudEl = $('hud');

canvas.addEventListener('mousedown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('gamepadconnected', () => unlockAudio());

// --- Title screen -------------------------------------------------------
// Zero stands by the crash site and waves until the player starts.
const PLAYER_ID: CharacterId = 'zero';
const preview = CHARACTERS[PLAYER_ID].build();
preview.root.position.set(level.spawn.x, world.groundHeight(level.spawn.x, level.spawn.z), level.spawn.z);
scene.add(preview.root);
{
  const card = $(`card-${PLAYER_ID}`);
  card.innerHTML = `<div class="name">${CHARACTERS[PLAYER_ID].name}</div><div class="tag">${CHARACTERS[PLAYER_ID].tagline}</div>`;
  card.classList.add('active');
  card.addEventListener('click', () => {
    unlockAudio();
    startGame();
  });
}

type Mode = 'select' | 'play';
let mode: Mode = 'select';
hudEl.hidden = true;
let player: Player | null = null;

function startGame() {
  if (mode !== 'select') return;
  mode = 'play';
  scene.remove(preview.root);

  player = new Player({ world, projectiles, effects, targets, kickables }, CHARACTERS[PLAYER_ID]);
  player.place(level.spawn, level.spawnYaw);
  scene.add(player.rig.root);
  cam.yaw = level.spawnYaw;

  // Roll stays behind with the ship.
  const companion = new Npc(
    'Roll',
    buildRollModel(),
    ["I'll stay with the Flutter and start patching the hull.", 'If the market has an engine part, grab it! And try not to break anything.'],
    level.companionSpot,
    world,
    0,
    level.companionYaw,
  );
  npcs.push(companion);
  scene.add(companion.rig.root);

  selectEl.hidden = true;
  hudEl.hidden = false;
  openDialog(companion.name, [
    "The Flutter's left engine is wrecked, Zero. We won't be flying anywhere today.",
    "There's a town called Apple Market up the path to the north. See if anyone there sells parts!",
  ]);
}

// --- Dialogue -----------------------------------------------------------
let dialog: { name: string; lines: string[]; index: number; npc: Npc | null } | null = null;

function openDialog(name: string, lines: string[], npc: Npc | null = null) {
  dialog = { name, lines, index: 0, npc };
  dialogEl.hidden = false;
  showLine();
}
function showLine() {
  if (!dialog) return;
  dialogName.textContent = dialog.name;
  dialogText.textContent = dialog.lines[dialog.index];
  sfx.talk();
}
function advanceDialog() {
  if (!dialog) return;
  dialog.index++;
  if (dialog.index >= dialog.lines.length) {
    dialog = null;
    dialogEl.hidden = true;
  } else showLine();
}

const RUIN_LINES = [
  "A massive stone door, carved with glowing rings. It doesn't budge an inch.",
  'There must be some way to open it. Maybe someone in town knows.',
];

function nearestInteraction(p: THREE.Vector3) {
  let best: { label: string; act: () => void } | null = null;
  let bestDist = TALK_RANGE;
  for (const n of npcs) {
    const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
    if (d < bestDist && Math.abs(n.pos.y - p.y) < 1.5) {
      bestDist = d;
      best = { label: `Talk to ${n.name}`, act: () => openDialog(n.name, n.lines, n) };
    }
  }
  if (p.distanceTo(level.ruinDoorFront) < 3.2) best = { label: 'Inspect the door', act: () => openDialog('Ruin door', RUIN_LINES) };
  return best;
}

// --- Area names and the can-in-fountain challenge -------------------------
let areaTimer = 0;
let lastArea = '';
function showArea(name: string) {
  areaEl.textContent = name;
  areaEl.classList.add('show');
  areaTimer = 3;
}

let canResetTimer = 0;
let canScored = false;

// --- HUD ------------------------------------------------------------------
function updateHud() {
  if (!player) return;
  startEl.hidden = input.pointerLocked || input.gamepadConnected || dialog !== null;
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
let time = 0;
let smokeTimer = 0;
const idle: Partial<InputState> = {
  moveX: 0,
  moveY: 0,
  jump: false,
  jumpHeld: false,
  fire: false,
  firePressed: false,
  kick: false,
  lockOn: false,
};

function updateSelect(state: InputState, elapsed: number) {
  if (state.confirm) startGame();
  const k = Math.min(1, elapsed * 8);
  preview.root.rotation.y = Math.sin(time * 1.5) * 0.3;
  preview.armR.rotation.x = THREE.MathUtils.lerp(preview.armR.rotation.x, -2.7 + Math.sin(time * 8) * 0.25, k);
  preview.armR.rotation.z = 0.3;
  preview.armL.rotation.z = 0.12;
  // Camera looks south at Zero, who faces north toward it.
  const focus = level.spawn.clone().add(new THREE.Vector3(0, 0.9, 0));
  camera.position.set(focus.x + Math.sin(time * 0.2) * 0.3, focus.y + 0.3, focus.z + 4.6);
  camera.lookAt(focus);
}

function updatePlay(state: InputState, elapsed: number) {
  const p = player!;
  if (dialog && (state.talk || state.confirm || state.firePressed)) advanceDialog();
  else {
    const interaction = nearestInteraction(p.pos);
    promptEl.style.display = interaction ? 'block' : 'none';
    if (interaction) promptEl.textContent = `F / Y  ${interaction.label}`;
    if (interaction && state.talk) interaction.act();
  }
  if (dialog) promptEl.style.display = 'none';

  const steps = Math.max(1, Math.ceil(elapsed / MAX_STEP));
  const dt = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    let stepInput: InputState = i === 0 ? state : { ...state, lookX: 0, lookY: 0, jump: false, kick: false, firePressed: false };
    if (dialog) stepInput = { ...stepInput, ...idle };
    cam.update(dt, stepInput, p.pos, p.lockTarget);
    p.update(dt, stepInput, cam.yaw, cam.forward, cam.aimPoint());
    can.nudge(p.pos, p.vel);
    can.update(dt);
    for (const n of npcs) {
      n.update(dt, p.pos, dialog?.npc === n);
      // Keep the player from walking through people.
      const dx = p.pos.x - n.pos.x;
      const dz = p.pos.z - n.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7 && d > 1e-4 && Math.abs(p.pos.y - n.pos.y) < 1.2) {
        p.pos.x = n.pos.x + (dx / d) * 0.7;
        p.pos.z = n.pos.z + (dz / d) * 0.7;
      }
    }
    projectiles.update(dt);
    effects.update(dt);
  }

  // Can challenge: kick it into the fountain.
  if (!canScored && level.inFountain(can.center)) {
    canScored = true;
    canResetTimer = 2.5;
    effects.burst(can.center, { color: 0x9fe0ff, count: 24, speed: 5, size: 0.12, life: 0.7, gravity: -8 });
    sfx.canHit();
    showArea('NICE SHOT!');
    if (kid) kid.lines.splice(0, kid.lines.length, 'WHOA! Right in the fountain!', "Okay, okay. You're way better at this than me.");
  }
  if (canResetTimer > 0) {
    canResetTimer -= elapsed;
    if (canResetTimer <= 0) {
      can.reset(level.canStart);
      canScored = false;
    }
  }
  // Fell out of the world somehow? Put it back in town.
  if (can.center.y < -20) can.reset(level.canStart);

  // Area names, music and ambience.
  const inMarket = level.inMarket(p.pos);
  const nearRuin = p.pos.distanceTo(level.ruinDoorFront) < 14;
  const area = inMarket ? 'APPLE MARKET' : nearRuin ? 'RUIN ENTRANCE' : p.pos.z < 30 ? 'CRASH SITE' : 'SOUTH FIELD PATH';
  if (area !== lastArea) {
    if (lastArea) showArea(area);
    lastArea = area;
  }
  music.play(inMarket ? marketTheme : null);
  ambience.update(inMarket ? 0.25 : 1);

  sun.position.copy(p.pos).add(SUN_OFFSET);
  sun.target.position.copy(p.pos);
}

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  time += elapsed;

  const state = input.poll(elapsed);
  if (mode === 'select') {
    updateSelect(state, elapsed);
    effects.update(elapsed);
    sun.position.copy(level.spawn).add(SUN_OFFSET);
    sun.target.position.copy(level.spawn);
  } else updatePlay(state, elapsed);

  level.update(elapsed, time);
  music.update();
  smokeTimer -= elapsed;
  if (smokeTimer <= 0) {
    smokeTimer = 0.09;
    for (const s of level.smokePoints) effects.smoke(s);
  }

  if (areaTimer > 0) {
    areaTimer -= elapsed;
    if (areaTimer <= 0) areaEl.classList.remove('show');
  }

  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at things from the dev console and tests.
Object.assign(window, {
  game: {
    scene,
    get player() {
      return player;
    },
    can,
    npcs,
    world,
    input,
    cam,
    level,
    renderer,
    startGame,
    advanceDialog,
  },
});
