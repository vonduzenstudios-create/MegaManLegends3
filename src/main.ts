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
import { bossTheme, marketTheme, ruinTheme } from './game/songs';
import { EnemyShots } from './game/combat';
import { Pickups } from './game/pickups';
import { type Enemy, type EnemyContext, Flyer, Hopper, Turret } from './game/enemies';
import { Boss, BOSS_NAME } from './game/boss';
import { buildRuinInterior, ORIGIN } from './game/level/ruinInterior';
import { RUIN } from './game/level/layout';
import { SPECIAL_MAX } from './game/player';
import { CHARACTERS, type CharacterId } from './game/characters';
import type { AnimState } from './game/playerModel';
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
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.1);
scene.add(hemi);
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
const ruin = buildRuinInterior(scene, world);

// Outdoors and underground share one scene; swap the sky, fog and light.
const fieldSky = { background: scene.background, fog: scene.fog };
const ruinSky = { background: new THREE.Color(0x07080d), fog: new THREE.Fog(0x0b0f1a, 14, 60) };
function setEnvironment(inside: boolean) {
  const sky = inside ? ruinSky : fieldSky;
  scene.background = sky.background;
  scene.fog = sky.fog;
  hemi.color.set(inside ? 0x8aa0c8 : 0xcfe8ff);
  hemi.groundColor.set(inside ? 0x2a2430 : 0x6a8a4a);
  hemi.intensity = inside ? 0.9 : 1.1;
  sun.intensity = inside ? 1.1 : 2.2;
}

const effects = new Effects(scene);
const targets: Target[] = [];
const kickables: Kickable[] = [];
const projectiles = new Projectiles(scene, world, effects, () => targets);

const shots = new EnemyShots(scene, world, effects);
const pickups = new Pickups(scene, world, effects);
const enemyCtx: EnemyContext = { scene, world, effects, shots, pickups };
const enemies: Enemy[] = [
  ...ruin.spawns.hoppers.map((p) => new Hopper(enemyCtx, p)),
  ...ruin.spawns.turrets.map((p) => new Turret(enemyCtx, p)),
  ...ruin.spawns.flyers.map((p) => new Flyer(enemyCtx, p)),
];
targets.push(...enemies);
for (const p of ruin.healSpots) pickups.dropHealth(p.clone().setY(p.y + 0.4), 30, true);

// --- The boss -------------------------------------------------------------
const minions: Enemy[] = [];
let bossDefeated = false;
let coreItem: THREE.Group | null = null;
const boss = new Boss(enemyCtx, ruin.arenaCenter, {
  summon(pos) {
    const h = new Hopper(enemyCtx, pos);
    minions.push(h);
    enemies.push(h);
    targets.push(h);
  },
  minions: () => minions.filter((m) => m.alive).length,
  defeated(pos) {
    bossDefeated = true;
    for (const m of minions) if (m.alive) m.die();
    pickups.dropZenny(pos.clone().setY(pos.y + 2), 1000);
    coreItem = buildCoreItem();
    coreItem.position.copy(pos).setY(pos.y + 1.3);
    scene.add(coreItem);
    ruin.setGate(false);
  },
});
targets.push(boss);

/** The Reaverbot core: what you came down here for. */
function buildCoreItem() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
  gem.scale.y = 1.5;
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: 0x5ae0ff }));
  g.add(gem, halo, ring);
  return g;
}

// --- The sealed ruin door: shoot its crystal core to open it --------------
const door = level.ruinDoor;
door.door.updateMatrixWorld(true);
let doorOpen = false;
let doorSink = 0;
const doorCore = {
  center: door.core.getWorldPosition(new THREE.Vector3()),
  radius: 0.7,
  hp: 6,
  get alive() {
    return !doorOpen;
  },
  hit(damage: number) {
    if (doorOpen) return;
    this.hp -= damage;
    effects.burst(this.center, { color: 0x9fefff, count: 8, speed: 3 });
    if (this.hp <= 0) openDoor();
  },
};
targets.push(doorCore);
function openDoor() {
  doorOpen = true;
  door.core.visible = false;
  effects.explosion(doorCore.center);
  sfx.explode();
  sfx.rumble();
  world.removeBox(door.collider);
  doorSink = 5.8;
  shake = 0.6;
  showArea('THE RUIN IS OPEN');
}

const can = new Can(world, level.canStart);
scene.add(can.group);
kickables.push(can);

const npcs: Npc[] = buildTownsfolk(world);
for (const n of npcs) scene.add(n.rig.root);
const kid = npcs.find((n) => n.name === 'Kid');

const input = new Input(canvas);
const cam = new CameraRig(camera, world);
// Keep the camera out of the boss's body.
cam.obstacles.push({
  center: boss.center,
  radius: 3.2,
  get active() {
    return boss.active;
  },
});
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
const zennyEl = $('zenny-count');
const specialEl = $('special');
const pipsEl = $('special-pips');
const bossEl = $('boss');
const bossFill = $('boss-fill');
const overlayEl = $('overlay');
const fadeEl = $('fade');
$('boss-name').textContent = BOSS_NAME;
for (let i = 0; i < SPECIAL_MAX; i++) pipsEl.appendChild(document.createElement('i'));

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

type Mode = 'select' | 'play' | 'gameover' | 'victory';
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
  'The crystal in the middle hums faintly. Maybe a few buster shots would wake it up.',
];
let chestOpen = false;
function openChest() {
  if (!player || chestOpen) return;
  chestOpen = true;
  player.hasSpecial = true;
  player.specialAmmo = SPECIAL_MAX;
  sfx.chest();
  effects.burst(ruin.chestSpot.clone().setY(ruin.chestSpot.y + 0.8), { color: 0xffe14a, count: 20, speed: 4, gravity: 0 });
  openDialog('Got the Active Buster!', [
    'A shoulder-mounted launcher that fires two homing missiles at once.',
    'Press Q, middle click or RB to fire. Ammo recharges over time, and lock-on picks the target.',
  ]);
}

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
  if (!doorOpen && p.distanceTo(level.ruinDoorFront) < 3.2) best = { label: 'Inspect the door', act: () => openDialog('Ruin door', RUIN_LINES) };
  if (!chestOpen && p.distanceTo(ruin.chestSpot) < 2.2) best = { label: 'Open the chest', act: openChest };
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

// --- Travel between the surface and the ruin ------------------------------
let transition: { t: number; done: boolean; act: () => void } | null = null;
function travel(act: () => void) {
  if (!transition) transition = { t: 0, done: false, act };
}
function enterRuin() {
  travel(() => {
    player!.place(ruin.entry, ruin.entryYaw);
    cam.yaw = ruin.entryYaw;
    cam.cut();
    setEnvironment(true);
  });
}
function leaveRuin() {
  travel(() => {
    player!.place(level.ruinDoorFront.clone().setY(level.ruinDoorFront.y - 0.8), Math.PI / 2);
    cam.yaw = Math.PI / 2;
    cam.cut();
    setEnvironment(false);
  });
}

// --- Game over and victory -------------------------------------------------
let reachedCheckpoint = false;
let deathTimer = 0;
let playTime = 0;
function showOverlay(title: string, text: string, hint: string, lost: boolean) {
  overlayEl.hidden = false;
  overlayEl.classList.toggle('lost', lost);
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  $('overlay-hint').textContent = hint;
  if (document.pointerLockElement) document.exitPointerLock();
}
function retry() {
  const p = player!;
  overlayEl.hidden = true;
  mode = 'play';
  shots.clear();
  pickups.clearDrops();
  for (const m of minions) if (m.alive) m.despawn();
  if (!bossDefeated) {
    boss.reset();
    ruin.setGate(false);
  }
  p.revive();
  const spot = reachedCheckpoint ? ruin.checkpoint : ruin.entry;
  p.place(spot, 0);
  cam.yaw = 0;
  cam.cut();
}
function collectCore() {
  scene.remove(coreItem!);
  coreItem = null;
  sfx.victory();
  mode = 'victory';
  const mins = Math.floor(playTime / 60);
  const secs = Math.floor(playTime % 60).toString().padStart(2, '0');
  showOverlay(
    'DEMO COMPLETE',
    `You recovered the Reaverbot core!\nThat should get the Flutter flying again.\n\nZenny collected: ${pickups.zenny}   ·   Time: ${mins}:${secs}`,
    'Press Enter / A to keep exploring',
    false,
  );
  const companion = npcs[npcs.length - 1];
  companion.lines.splice(0, companion.lines.length, 'You found a Reaverbot core? That thing is perfect!', "Give me a little while and we'll be back in the air.");
}
overlayEl.addEventListener('click', () => {
  if (mode === 'gameover') retry();
  else if (mode === 'victory') {
    overlayEl.hidden = true;
    mode = 'play';
  }
});

// --- HUD ------------------------------------------------------------------
let shake = 0;
function updateHud() {
  if (!player) return;
  startEl.hidden = input.pointerLocked || input.gamepadConnected || dialog !== null || mode !== 'play';
  lifeEl.style.width = `${(player.life / player.maxLife) * 100}%`;
  zennyEl.textContent = String(pickups.zenny);
  specialEl.hidden = !player.hasSpecial;
  if (player.hasSpecial) pipsEl.childNodes.forEach((n, i) => (n as HTMLElement).classList.toggle('on', i < player!.specialAmmo));
  bossEl.hidden = !boss.active;
  bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
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
let rawConfirm = false;
const idle: Partial<InputState> = {
  moveX: 0,
  moveY: 0,
  jump: false,
  jumpHeld: false,
  fire: false,
  firePressed: false,
  kick: false,
  special: false,
  lockOn: false,
};

// Standing still on the title screen; clip-driven rigs idle and look around.
const TITLE_ANIM: AnimState = {
  speed: 0,
  vel: new THREE.Vector3(),
  yawRate: 0,
  grounded: true,
  justJumped: false,
  landingSpeed: 0,
  kick: -1,
  aiming: false,
  hurt: false,
  dead: false,
  lookDir: null,
};

function updateSelect(state: InputState, elapsed: number) {
  if (state.confirm) startGame();
  preview.drive?.(TITLE_ANIM, elapsed);
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
  if (mode !== 'play' || transition) state = { ...state, ...idle, talk: false, confirm: false, lookX: 0, lookY: 0 };
  if (mode === 'play') playTime += elapsed;
  if (dialog && (state.talk || state.confirm || state.firePressed)) advanceDialog();
  else {
    const interaction = nearestInteraction(p.pos);
    promptEl.style.display = interaction ? 'block' : 'none';
    if (interaction) promptEl.textContent = `F / Y  ${interaction.label}`;
    if (interaction && state.talk) interaction.act();
  }
  if (dialog) promptEl.style.display = 'none';

  const inRuin = ruin.contains(p.pos);
  const steps = Math.max(1, Math.ceil(elapsed / MAX_STEP));
  const dt = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    let stepInput: InputState = i === 0 ? state : { ...state, lookX: 0, lookY: 0, jump: false, kick: false, firePressed: false, special: false };
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
    if (inRuin) {
      for (const e of enemies) e.update(dt, p);
      boss.update(dt, p);
      shots.update(dt, p);
    }
    pickups.update(dt, p, time);
    projectiles.update(dt);
    effects.update(dt);
  }
  shake = Math.max(shake, boss.shake);
  boss.shake = 0;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake = Math.max(0, shake - elapsed * 2.5);
  }

  // --- The ruin: door, travel, boss fight, death -------------------------
  if (doorSink > 0) {
    const d = Math.min(doorSink, elapsed * 2.4);
    doorSink -= d;
    door.door.position.y -= d;
    if (Math.random() < 0.5) effects.dust(new THREE.Vector3(RUIN.x + 0.9, level.ruinDoorFront.y - 0.8, RUIN.y + (Math.random() - 0.5) * 4), 2);
    shake = Math.max(shake, 0.15);
  }
  if (mode === 'play' && !inRuin && doorOpen && doorSink <= 0 && p.pos.x < level.ruinDoorFront.x - 1.3 && Math.abs(p.pos.z - level.ruinDoorFront.z) < 2) {
    enterRuin();
  }
  if (mode === 'play' && ruin.atExit(p.pos)) leaveRuin();
  if (inRuin && p.pos.z - ORIGIN.z > 70) reachedCheckpoint = true;
  if (mode === 'play' && !bossDefeated && boss.state === 'dormant' && ruin.inArena(p.pos)) {
    ruin.setGate(true);
    boss.start();
    showArea('GUARDIAN CHAMBER');
  }
  if (coreItem) {
    coreItem.rotation.y += elapsed * 2;
    coreItem.position.y += Math.sin(time * 3) * 0.004;
    if (mode === 'play' && coreItem.position.distanceTo(p.pos.clone().setY(p.pos.y + 0.8)) < 1.4) collectCore();
  }
  if (mode === 'play' && p.dead) {
    deathTimer += elapsed;
    if (deathTimer > 1.4) {
      mode = 'gameover';
      deathTimer = 0;
      p.lockTarget = null;
      effects.explosion(p.head);
      showOverlay('GAME OVER', 'The Reaverbots got the better of you this time.', 'Press Enter / A to try again', true);
    }
  }
  if (mode === 'gameover' && rawConfirm) retry();
  else if (mode === 'victory' && rawConfirm) {
    overlayEl.hidden = true;
    mode = 'play';
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
  const area = inRuin
    ? 'ANCIENT RUIN'
    : inMarket
      ? 'APPLE MARKET'
      : nearRuin
        ? 'RUIN ENTRANCE'
        : p.pos.z < 30
          ? 'CRASH SITE'
          : 'SOUTH FIELD PATH';
  if (area !== lastArea) {
    if (lastArea) showArea(area);
    lastArea = area;
  }
  music.play(inRuin ? (boss.active ? bossTheme : mode === 'victory' ? null : ruinTheme) : inMarket ? marketTheme : null);
  ambience.update(inRuin ? 0 : inMarket ? 0.25 : 1);

  sun.position.copy(p.pos).add(SUN_OFFSET);
  sun.target.position.copy(p.pos);
}

function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  time += elapsed;

  const state = input.poll(elapsed);
  rawConfirm = state.confirm;
  if (mode === 'select') {
    updateSelect(state, elapsed);
    effects.update(elapsed);
    sun.position.copy(level.spawn).add(SUN_OFFSET);
    sun.target.position.copy(level.spawn);
  } else updatePlay(state, elapsed);

  level.update(elapsed, time);
  ruin.update(elapsed, time);
  if (chestOpen) ruin.chestLid.rotation.x = THREE.MathUtils.lerp(ruin.chestLid.rotation.x, -1.9, Math.min(1, elapsed * 6));
  if (transition) {
    transition.t += elapsed;
    if (!transition.done && transition.t >= 0.35) {
      transition.done = true;
      transition.act();
    }
    fadeEl.style.opacity = String(transition.t < 0.35 ? transition.t / 0.35 : Math.max(0, 1 - (transition.t - 0.35) / 0.45));
    if (transition.t > 0.8) transition = null;
  }
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
    ruin,
    boss,
    enemies,
    pickups,
    openDoor,
    enterRuin,
    retry,
    get mode() {
      return mode;
    },
    get time() {
      return time;
    },
  },
});
