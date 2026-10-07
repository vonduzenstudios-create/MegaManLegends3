import * as THREE from 'three';
import type { Box, CollisionWorld } from '../../engine/collision';
import { batchStatic } from '../../engine/staticBatch';
import { mulberry32 } from '../../engine/noise';
import { toonMesh, toonTextured } from '../../engine/toon';

/**
 * The ruin interior lives in the same scene, far east of the overworld, so
 * the camera's far plane and fog keep the two from ever seeing each other.
 * Everything below is laid out in local coordinates relative to ORIGIN,
 * running north (+Z) from the entrance to the boss arena.
 */
export const ORIGIN = new THREE.Vector3(1000, 0, 0);

const WALL = 0xb2aa9a;
const WALL_DARK = 0x7e786e;
const CEILING = 0x34303a;
const GLOW = 0x5ae0ff;
const GLOW_EMISSIVE = 0x2a9ac0;

interface Opening {
  from: number;
  to: number;
  top: number;
}

interface RoomSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
  south?: Opening;
  north?: Opening;
}

/** Room outlines, south to north. */
const ROOMS: Record<string, RoomSpec> = {
  entry: { x0: -4, x1: 4, z0: 0, z1: 22, height: 6, south: { from: -3, to: 3, top: 4.5 }, north: { from: -4, to: 4, top: 6 } },
  hall: { x0: -13, x1: 13, z0: 22, z1: 48, height: 9, south: { from: -4, to: 4, top: 6 }, north: { from: -3, to: 3, top: 5 } },
  corridor: { x0: -3, x1: 3, z0: 48, z1: 70, height: 5, south: { from: -3, to: 3, top: 5 }, north: { from: -3, to: 3, top: 5 } },
  antechamber: { x0: -7, x1: 7, z0: 70, z1: 78, height: 7, south: { from: -3, to: 3, top: 5 }, north: { from: -4, to: 4, top: 6 } },
  arena: { x0: -20, x1: 20, z0: 78, z1: 118, height: 16, south: { from: -4, to: 4, top: 6 } },
};

export const ARENA = {
  minX: -20,
  maxX: 20,
  minZ: 78,
  maxZ: 118,
  /** Stepping past this line seals the gate and wakes the boss. */
  triggerZ: 81.5,
  center: new THREE.Vector3(0, 0, 100),
};

const ARENA_PILLARS: [number, number][] = [
  [-11, 91],
  [11, 91],
  [-11, 107],
  [11, 107],
];

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4650';
  g.fillRect(0, 0, 128, 128);
  const rand = mulberry32(7);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const v = 120 + Math.floor(rand() * 26);
      g.fillStyle = `rgb(${v}, ${v - 6}, ${v - 16})`;
      g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
      // A faint carved glyph on some tiles.
      if (rand() < 0.5) {
        g.strokeStyle = 'rgba(70, 90, 110, 0.5)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x * 64 + 32, y * 64 + 32, 12, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export interface RuinInterior {
  entry: THREE.Vector3;
  entryYaw: number;
  /** True once you have climbed the stairs back toward the surface. */
  atExit(p: THREE.Vector3): boolean;
  /** Respawn point in front of the boss gate. */
  checkpoint: THREE.Vector3;
  chestSpot: THREE.Vector3;
  chestLid: THREE.Object3D;
  healSpots: THREE.Vector3[];
  spawns: { hoppers: THREE.Vector3[]; turrets: THREE.Vector3[]; flyers: THREE.Vector3[] };
  arenaCenter: THREE.Vector3;
  contains(p: THREE.Vector3): boolean;
  inArena(p: THREE.Vector3): boolean;
  setGate(closed: boolean): void;
  update(dt: number, time: number): void;
}

export function buildRuinInterior(scene: THREE.Scene, world: CollisionWorld): RuinInterior {
  const O = ORIGIN;
  const statics = new THREE.Group();
  const outside = world.groundHeight;
  world.groundHeight = (x, z) => (x > 500 ? O.y : outside(x, z));

  const at = (x: number, y: number, z: number) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  const collide = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    world.addBox(at(x, y + h / 2, z), new THREE.Vector3(w, h, d));
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, color = WALL, solid = true, emissive?: number) => {
    const m = toonMesh(new THREE.BoxGeometry(w, h, d), color, emissive !== undefined ? { emissive } : {});
    m.position.copy(at(x, y + h / 2, z));
    statics.add(m);
    if (solid) collide(x, y, z, w, h, d);
    return m;
  };

  const tiles = tileTexture();
  const floorMat = toonTextured(tiles);

  for (const room of Object.values(ROOMS)) buildRoom(room);

  function buildRoom(r: RoomSpec) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;

    // Tiled floor, one tile per 2 m.
    const floorGeo = new THREE.PlaneGeometry(w, d);
    const uv = floorGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (d / 4));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(at(cx, 0.01, cz));
    floor.receiveShadow = true;
    statics.add(floor);

    // Ceiling slab; it never casts shadows so the "sun" still lights the floor.
    const ceil = toonMesh(new THREE.BoxGeometry(w + 2, 1, d + 2), CEILING, { castShadow: false, outline: false });
    ceil.position.copy(at(cx, r.height + 0.5, cz));
    statics.add(ceil);
    collide(cx, r.height, cz, w + 2, 1, d + 2);

    // East and west walls are solid; north and south may have openings.
    for (const x of [r.x0 - 0.5, r.x1 + 0.5]) {
      block(x, 0, cz, 1, r.height, d + 2);
      // Glowing glyph band along the wall.
      const inner = x < cx ? x + 0.52 : x - 0.52;
      block(inner, 1.6, cz, 0.05, 0.12, d - 1, GLOW, false, GLOW_EMISSIVE);
      // Buttresses every 6 m.
      for (let z = r.z0 + 3; z < r.z1 - 1; z += 6) block(x < cx ? r.x0 + 0.3 : r.x1 - 0.3, 0, z, 0.6, r.height, 0.9, WALL_DARK);
    }
    for (const [z, opening] of [
      [r.z0 - 0.5, r.south],
      [r.z1 + 0.5, r.north],
    ] as [number, Opening | undefined][]) {
      if (!opening) {
        block(cx, 0, z, w, r.height, 1);
        continue;
      }
      if (opening.from > r.x0) block((r.x0 + opening.from) / 2, 0, z, opening.from - r.x0, r.height, 1);
      if (opening.to < r.x1) block((opening.to + r.x1) / 2, 0, z, r.x1 - opening.to, r.height, 1);
      if (opening.top < r.height) block((opening.from + opening.to) / 2, opening.top, z, opening.to - opening.from, r.height - opening.top, 1, WALL_DARK);
    }
  }

  // --- Entry: a stairwell climbing back up to the surface --------------
  for (let i = 0; i < 12; i++) block(0, 0, -0.25 - i * 0.5, 6, 0.28 * (i + 1), 0.5, i % 2 ? WALL : WALL_DARK);
  for (const x of [-3.5, 3.5]) block(x, 0, -3.5, 1, 9, 7);
  block(0, 0, -7, 8, 9, 1);
  // A shaft of daylight pouring down the stairs.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.8, 7, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  );
  shaft.position.copy(at(0, 4, -3.2));
  shaft.rotation.x = -0.35;
  scene.add(shaft);

  // --- Hall: pillars, a raised ledge with the chest ----------------------
  for (const [x, z] of [
    [-7, 30],
    [7, 30],
    [-7, 40],
  ]) {
    block(x, 0, z, 1.8, 9, 1.8);
    block(x, 2.5, z, 1.86, 0.15, 1.86, GLOW, false, GLOW_EMISSIVE);
  }
  block(9, 0, 43, 6, 1.6, 8, WALL_DARK);
  block(4.75, 0, 43.5, 2.5, 0.8, 5, WALL);
  const chestSpot = at(9.5, 1.6, 45);
  const chest = new THREE.Group();
  chest.position.copy(chestSpot);
  chest.rotation.y = Math.PI;
  const chestBody = toonMesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), 0x7a5a3a);
  chestBody.position.y = 0.3;
  const band = toonMesh(new THREE.BoxGeometry(1.14, 0.1, 0.74), 0xd8b040, { outline: false });
  band.position.y = 0.45;
  const chestLid = new THREE.Group();
  chestLid.position.set(0, 0.6, -0.35);
  const lid = toonMesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI), 0x8a6a46, { outline: false });
  lid.material = (lid.material as THREE.MeshToonMaterial).clone();
  lid.material.side = THREE.DoubleSide;
  lid.rotation.z = Math.PI / 2;
  lid.position.set(0, 0, 0.35);
  chestLid.add(lid);
  chest.add(chestBody, band, chestLid);
  scene.add(chest);
  collide(9.5, 1.6, 45, 1.1, 0.9, 0.7);

  // --- Corridor: low cover blocks ----------------------------------------
  block(-1.5, 0, 56, 2.2, 1, 1);
  block(1.6, 0, 62, 2, 1.2, 1);
  block(-1.4, 0, 66.5, 2.4, 0.8, 1);

  // --- Antechamber: a glowing checkpoint pad in front of the gate ---------
  const pad = toonMesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 24), GLOW, { emissive: GLOW_EMISSIVE, outline: false });
  pad.position.copy(at(0, 0.04, 73.5));
  statics.add(pad);

  // --- Arena ---------------------------------------------------------------
  for (const [x, z] of ARENA_PILLARS) {
    block(x, 0, z, 2.6, 16, 2.6);
    block(x, 3, z, 2.66, 0.2, 2.66, GLOW, false, GLOW_EMISSIVE);
    block(x, 0, z, 3.2, 0.6, 3.2, WALL_DARK, false);
  }
  // A ring of glyphs carved into the arena floor.
  const ring = toonMesh(new THREE.TorusGeometry(9, 0.12, 6, 64), GLOW, { emissive: GLOW_EMISSIVE, outline: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(at(0, 0.03, 100));
  statics.add(ring);

  // The gate slab that drops behind you when the boss wakes.
  const gate = toonMesh(new THREE.BoxGeometry(8, 6, 0.8), 0x8f8a80);
  const gateOpenY = O.y + 6 + 3;
  const gateClosedY = O.y + 3;
  gate.position.copy(at(0, 0, 77.6));
  gate.position.y = gateOpenY;
  scene.add(gate);
  let gateBox: Box | null = null;
  let gateGoal = gateOpenY;

  // Crystal clusters glowing in the corners.
  const rand = mulberry32(42);
  const crystals: [number, number][] = [
    [-3.2, 6],
    [3.3, 15],
    [-12, 24],
    [12.2, 36],
    [-12, 46],
    [-2.6, 51],
    [2.5, 59],
    [-6, 77],
    [6, 71],
    [-19, 80],
    [19, 80],
    [-19, 116],
    [19, 116],
    [0, 117],
  ];
  for (const [x, z] of crystals) {
    for (let i = 0; i < 4; i++) {
      const s = 0.25 + rand() * 0.45;
      const c = toonMesh(new THREE.OctahedronGeometry(s, 0), GLOW, { emissive: GLOW_EMISSIVE, outline: false });
      c.position.copy(at(x + (rand() - 0.5) * 0.8, s * 0.8, z + (rand() - 0.5) * 0.8));
      c.scale.y = 1.8;
      c.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6);
      statics.add(c);
    }
  }
  // Rubble strewn about.
  for (let i = 0; i < 26; i++) {
    const room = Object.values(ROOMS)[i % 5];
    const x = room.x0 + 0.8 + rand() * (room.x1 - room.x0 - 1.6);
    const z = room.z0 + 1 + rand() * (room.z1 - room.z0 - 2);
    if (Math.abs(x) < 3) continue;
    const s = 0.2 + rand() * 0.35;
    const r = toonMesh(new THREE.DodecahedronGeometry(s, 0), WALL_DARK);
    r.position.copy(at(x, s * 0.6, z));
    r.rotation.set(rand() * 3, rand() * 3, 0);
    statics.add(r);
  }

  scene.add(batchStatic(statics));

  const v = (x: number, z: number) => at(x, 0, z);
  return {
    entry: v(0, 3),
    entryYaw: 0,
    atExit: (p) => p.x > 500 && p.z - O.z < -3,
    checkpoint: v(0, 73.5),
    chestSpot,
    chestLid,
    healSpots: [v(-5.5, 72), v(5.5, 72)],
    spawns: {
      hoppers: [v(0, 13), v(2, 18), v(-4, 31), v(3, 35), v(-9, 37), v(-2, 44)],
      turrets: [v(-10.5, 45.5), v(10.5, 25.5)],
      flyers: [v(0, 55), v(-1, 61), v(1, 66)],
    },
    arenaCenter: v(0, 100),
    contains: (p) => p.x > 500,
    inArena: (p) => p.x > 500 && p.z - O.z > ARENA.triggerZ,
    setGate(closed) {
      gateGoal = closed ? gateClosedY : gateOpenY;
      if (closed && !gateBox) gateBox = collide(0, 0, 77.6, 8, 6, 0.8);
      if (!closed && gateBox) {
        world.removeBox(gateBox);
        gateBox = null;
      }
    },
    update(dt, time) {
      gate.position.y += Math.sign(gateGoal - gate.position.y) * Math.min(Math.abs(gateGoal - gate.position.y), dt * 14);
      (shaft.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(time * 0.8) * 0.03;
    },
  };
}
