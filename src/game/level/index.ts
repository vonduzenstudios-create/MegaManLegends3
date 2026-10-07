import * as THREE from 'three';
import type { Box, CollisionWorld } from '../../engine/collision';
import { batchStatic } from '../../engine/staticBatch';
import { mulberry32 } from '../../engine/noise';
import { toonMesh } from '../../engine/toon';
import { BOUNDS, CRASH, MARKET, MARKET_HEIGHT, PATH_SAMPLES, RUIN, SPAWN, terrainHeight } from './layout';
import { buildGroundCover, buildTerrain, openGround } from './terrain';
import { buildFlutter, buildSupportCar } from './flutter';
import { buildMarket, FOUNTAIN_RADIUS, PLAZA_HALF, textTexture } from './market';
import { buildRuinEntrance } from './ruin';
import { fence, rock, signpost, tree } from './props';

export interface Level {
  spawn: THREE.Vector3;
  spawnYaw: number;
  canStart: THREE.Vector3;
  /** Where the character you didn't pick waits, by the support car. */
  companionSpot: THREE.Vector3;
  companionYaw: number;
  smokePoints: THREE.Vector3[];
  ruinDoorFront: THREE.Vector3;
  ruinDoor: {
    door: THREE.Group;
    ring: THREE.Mesh;
    core: THREE.Mesh;
    dark: THREE.Mesh;
    collider: Box;
  };
  fountainCenter: THREE.Vector3;
  update(dt: number, time: number): void;
  inMarket(p: THREE.Vector3): boolean;
  inFountain(p: THREE.Vector3): boolean;
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f82e0');
  grad.addColorStop(0.5, '#86c4ff');
  grad.addColorStop(1, '#e2f4ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildLevel(scene: THREE.Scene, world: CollisionWorld): Level {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xcfe9ff, 70, 190);
  world.groundHeight = terrainHeight;

  const rand = mulberry32(2026);
  const statics = new THREE.Group();
  const collide = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    world.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w, h, d));

  scene.add(buildTerrain());
  scene.add(buildGroundCover());

  // Invisible walls at the edge of the map (the ridges already discourage it).
  collide(BOUNDS.minX, -20, (BOUNDS.minZ + BOUNDS.maxZ) / 2, 1, 80, BOUNDS.maxZ - BOUNDS.minZ);
  collide(BOUNDS.maxX, -20, (BOUNDS.minZ + BOUNDS.maxZ) / 2, 1, 80, BOUNDS.maxZ - BOUNDS.minZ);
  collide(0, -20, BOUNDS.minZ, BOUNDS.maxX - BOUNDS.minX, 80, 1);
  collide(0, -20, BOUNDS.maxZ, BOUNDS.maxX - BOUNDS.minX, 80, 1);

  // --- Crash site --------------------------------------------------------
  const { ship, smoke } = buildFlutter();
  const shipBase = new THREE.Vector3(CRASH.x - 8, terrainHeight(CRASH.x - 8, CRASH.y - 2) - 0.9, CRASH.y - 2);
  ship.position.copy(shipBase);
  ship.rotation.set(0.1, 0.55, -0.12, 'YXZ');
  statics.add(ship);
  ship.updateMatrixWorld(true);
  // Approximate the tilted hull with a row of boxes along its spine.
  for (let t = -9; t <= 9; t += 3) {
    const p = ship.localToWorld(new THREE.Vector3(0, 1.4, t));
    const w = t > 6 || t < -7 ? 4 : 6.5;
    collide(p.x, p.y - 2.5, p.z, w, 5.2, w);
  }
  for (const s of [-1, 1]) {
    const p = ship.localToWorld(new THREE.Vector3(s * 7.6, 1.6, -1.6));
    collide(p.x, p.y - 2, p.z, 2.4, 3.2, 2.4);
  }
  const smokePoints = smoke.map((p) => ship.localToWorld(p.clone()));

  // Debris thrown from the crash.
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 6;
    const x = CRASH.x - 6 + Math.cos(a) * r;
    const z = CRASH.y - 2 + Math.sin(a) * r * 0.7;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4) continue;
    const s = 0.4 + rand() * 0.7;
    const panel = toonMesh(new THREE.BoxGeometry(s * 1.6, s * 0.2, s), rand() < 0.6 ? 0xf1e9d6 : 0xc8402c);
    panel.position.set(x, terrainHeight(x, z) + s * 0.1, z);
    panel.rotation.set(rand() * 0.6, rand() * 3, rand() * 0.5);
    statics.add(panel);
  }

  const car = buildSupportCar();
  const carPos = new THREE.Vector3(CRASH.x + 9, 0, CRASH.y + 1);
  carPos.y = terrainHeight(carPos.x, carPos.z);
  car.position.copy(carPos);
  car.rotation.y = -0.35;
  statics.add(car);
  collide(carPos.x, carPos.y, carPos.z, 3.2, 2.4, 4.4);

  const sign = signpost();
  const signPos = new THREE.Vector3(SPAWN.x + 3.5, 0, SPAWN.z + 4);
  sign.position.set(signPos.x, terrainHeight(signPos.x, signPos.z), signPos.z);
  sign.rotation.y = Math.PI + 0.3;
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.4),
    new THREE.MeshBasicMaterial({ map: textTexture('MARKET  ↑', '#b07a46', '#3a2a1a', 256, 90) }),
  );
  signFace.position.set(0, 1.45, -0.05);
  signFace.rotation.y = Math.PI;
  sign.add(signFace);
  statics.add(sign);
  collide(sign.position.x, sign.position.y, sign.position.z, 0.3, 1.8, 0.3);

  // --- Scenery along the path --------------------------------------------
  const ruinClear = (x: number, z: number) => Math.hypot(x - RUIN.x - 4, z - RUIN.y) > 14;
  let trees = 0;
  for (let tries = 0; trees < 120 && tries < 4000; tries++) {
    const x = BOUNDS.minX + 4 + rand() * (BOUNDS.maxX - BOUNDS.minX - 8);
    const z = BOUNDS.minZ + 4 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 8);
    if (!openGround(x, z, 3) || !ruinClear(x, z)) continue;
    const s = 0.8 + rand() * 0.7;
    const t = tree(s, Math.floor(rand() * 2));
    const y = terrainHeight(x, z);
    t.position.set(x, y - 0.1, z);
    t.rotation.y = rand() * Math.PI * 2;
    statics.add(t);
    collide(x, y - 1, z, 0.6 * s, 3.5 * s, 0.6 * s);
    trees++;
  }
  let rocks = 0;
  for (let tries = 0; rocks < 45 && tries < 3000; tries++) {
    const x = BOUNDS.minX + 4 + rand() * (BOUNDS.maxX - BOUNDS.minX - 8);
    const z = BOUNDS.minZ + 4 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 8);
    if (!openGround(x, z, 1)) continue;
    const s = 0.4 + rand() * 1.3;
    const r = rock(s, rand() < 0.5 ? 0xa8a090 : 0x9a9488);
    const y = terrainHeight(x, z);
    r.position.set(x, y - s * 0.15, z);
    r.rotation.y = rand() * Math.PI * 2;
    statics.add(r);
    if (s > 0.8) collide(x, y - 1, z, s * 1.4, s * 0.6 + 1, s * 1.4);
    rocks++;
  }

  // Fences line the last stretch of path before the market.
  for (let i = 0; i < PATH_SAMPLES.length - 1; i += 6) {
    const a = PATH_SAMPLES[i];
    const b = PATH_SAMPLES[Math.min(i + 6, PATH_SAMPLES.length - 1)];
    if (a.y < 96 || b.y > 134) continue;
    const dir = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    const side = new THREE.Vector2(-dir.y, dir.x);
    for (const s of [-1, 1]) {
      const off = 4.2 * s;
      const p1 = new THREE.Vector3(a.x + side.x * off, 0, a.y + side.y * off);
      const p2 = new THREE.Vector3(b.x + side.x * off, 0, b.y + side.y * off);
      p1.y = terrainHeight(p1.x, p1.z);
      p2.y = terrainHeight(p2.x, p2.z);
      statics.add(fence(p1, p2));
    }
  }

  // --- Apple Market and the ruin -----------------------------------------
  const market = buildMarket(world);
  statics.add(market.scenery);
  const ruin = buildRuinEntrance(world);
  statics.add(ruin.scenery);

  // The ruin door moves and its emblem pulses, so it stays out of the batch.
  scene.add(ruin.door, ruin.dark);
  const ruinGlow = [ruin.ring, ruin.core];

  // Bake all other static scenery down to a handful of draw calls.
  scene.add(batchStatic(statics));
  scene.add(market.water, market.spray.group);

  const fountainCenter = market.fountainCenter;
  return {
    spawn: new THREE.Vector3(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z),
    spawnYaw: 0,
    canStart: new THREE.Vector3(MARKET.x + 5, MARKET_HEIGHT, MARKET.y - 9),
    companionSpot: new THREE.Vector3(carPos.x - 2.2, terrainHeight(carPos.x - 2.2, carPos.z + 2.5), carPos.z + 2.5),
    companionYaw: -2.4,
    smokePoints,
    ruinDoorFront: ruin.doorFront,
    ruinDoor: { door: ruin.door, ring: ruin.ring, core: ruin.core, dark: ruin.dark, collider: ruin.doorBox },
    fountainCenter,
    update(dt, time) {
      market.spray.update(dt, time);
      const pulse = 0.6 + Math.sin(time * 2.5) * 0.4;
      for (const g of ruinGlow) {
        (g.material as THREE.MeshToonMaterial).emissiveIntensity = 0.5 + pulse;
        if (g === ruin.core) g.rotateX(dt * 1.5);
      }
    },
    inMarket(p) {
      return Math.abs(p.x - MARKET.x) < PLAZA_HALF + 6 && p.z > MARKET.y - PLAZA_HALF - 8 && p.z < MARKET.y + PLAZA_HALF + 6;
    },
    inFountain(p) {
      return Math.hypot(p.x - fountainCenter.x, p.z - fountainCenter.z) < FOUNTAIN_RADIUS - 0.1 && p.y < fountainCenter.y + 1.0;
    },
  };
}
