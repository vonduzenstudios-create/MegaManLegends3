import * as THREE from 'three';
import type { CollisionWorld } from '../../engine/collision';
import { toonMesh } from '../../engine/toon';
import { RUIN, terrainHeight } from './layout';

const STONE = 0xb8b0a0;
const STONE_DARK = 0x8a8478;
const MOSS = 0x6a9a4a;
const GLOW = 0x5ae0ff;

function block(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, emissive?: number) {
  const m = toonMesh(new THREE.BoxGeometry(w, h, d), color, emissive !== undefined ? { emissive } : {});
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * The sealed ruin entrance, cut into the hillside west of the path.
 * The facade faces east (+X). Returns the static scenery, the animated
 * glow parts and the spot in front of the door.
 */
export function buildRuinEntrance(world: CollisionWorld) {
  const scenery = new THREE.Group();
  const base = terrainHeight(RUIN.x + 3, RUIN.y) - 0.2;
  const g = new THREE.Group();
  g.position.set(RUIN.x, base, RUIN.y);

  // Stone apron and steps leading up to the door.
  block(g, 6, 0.4, 9, STONE_DARK, 1.8, 0.2, 0);
  for (let i = 0; i < 3; i++) block(g, 1, 0.3 * (i + 1), 5, STONE, 4.4 - i, 0.15 * (i + 1), 0);

  // Massive pillars and lintel, sunk back into the hill.
  for (const s of [-1, 1]) {
    block(g, 2.2, 7, 2.2, STONE, 0, 3.5, s * 3.3);
    block(g, 2.6, 0.6, 2.6, STONE_DARK, 0, 0.3, s * 3.3);
    block(g, 2.5, 0.5, 2.5, STONE_DARK, 0, 6.9, s * 3.3);
    // Glowing glyph strip running up each pillar.
    block(g, 0.08, 4.5, 0.3, GLOW, 1.13, 3.3, s * 3.3, 0x2a9ac0);
    // Moss creeping over the top.
    const moss = toonMesh(new THREE.IcosahedronGeometry(0.9, 0), MOSS);
    moss.position.set(-0.2, 7.3, s * 3.3);
    moss.scale.set(1.4, 0.5, 1.4);
    g.add(moss);
  }
  block(g, 3, 1.6, 9.2, STONE, -0.2, 7.6, 0);
  block(g, 0.1, 0.3, 6.5, GLOW, 1.31, 7.6, 0, 0x2a9ac0);
  // Back wall that fills the arch behind the door.
  block(g, 3, 8, 4.4, STONE_DARK, -1.2, 4, 0);

  // The sealed door: a heavy slab with a glowing ring emblem.
  const door = block(g, 0.6, 5.4, 4.2, 0x8f8a80, 0.3, 2.7 + 0.4, 0);
  door.name = 'ruin-door';
  const ring = toonMesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), GLOW, { emissive: 0x2a9ac0, outline: false });
  ring.rotation.y = Math.PI / 2;
  ring.position.set(0.62, 3.2, 0);
  const core = toonMesh(new THREE.OctahedronGeometry(0.45, 0), GLOW, { emissive: 0x2a9ac0, outline: false });
  core.position.set(0.7, 3.2, 0);
  g.add(ring, core);

  // Tumbled blocks around the entrance.
  const rubble: [number, number, number, number, number][] = [
    [4.5, 0.4, 5.2, 1.2, 0.3],
    [5.5, 0.3, -5, 0.9, 0.8],
    [3.2, 0.5, -6.2, 1.4, 0.1],
    [6.8, 0.3, 3.4, 0.7, 1.2],
  ];
  for (const [x, y, z, s, r] of rubble) {
    const b = block(g, s, s * 0.8, s, STONE, x, y, z);
    b.rotation.set(r * 0.3, r, r * 0.2);
  }

  // Ruined columns flanking the approach.
  for (const [x, z, h] of [
    [8, 6.5, 3.2],
    [8, -6.5, 2.1],
    [12, 7, 1.4],
  ]) {
    const col = toonMesh(new THREE.CylinderGeometry(0.55, 0.65, h, 10), STONE);
    col.position.set(x, h / 2, z);
    g.add(col);
  }

  scenery.add(g);

  // Colliders (world space; the facade is axis-aligned).
  const add = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    world.addBox(new THREE.Vector3(RUIN.x + x, base + y + h / 2, RUIN.y + z), new THREE.Vector3(w, h, d));
  add(0, -2, 3.3, 2.2, 9, 2.2);
  add(0, -2, -3.3, 2.2, 9, 2.2);
  add(-1.2, -2, 0, 3, 10, 4.4);
  add(0.3, 0, 0, 0.6, 5.8, 4.2);
  for (let i = 0; i < 3; i++) add(4.4 - i, 0, 0, 1, 0.3 * (i + 1), 5);
  add(1.8, 0, 0, 6, 0.4, 9);
  for (const [x, z, h] of [
    [8, 6.5, 3.2],
    [8, -6.5, 2.1],
    [12, 7, 1.4],
  ]) {
    add(x, -1, z, 1.2, h + 1, 1.2);
  }

  const doorFront = new THREE.Vector3(RUIN.x + 2.5, base + 1.3, RUIN.y);
  return { scenery, glow: [ring, core], doorFront };
}
