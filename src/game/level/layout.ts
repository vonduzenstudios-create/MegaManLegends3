import * as THREE from 'three';
import { fbm, smoothstep } from '../../engine/noise';

// World layout. +Z is north: the Flutter crash site is at the south end,
// the grassy path climbs north to Apple Market, and the ruin entrance is
// cut into a hillside just west of the market gate.

export const BOUNDS = { minX: -52, maxX: 52, minZ: -28, maxZ: 200 };

export const CRASH = new THREE.Vector2(0, 0);
export const SPAWN = new THREE.Vector3(4, 0, 9);

export const MARKET = new THREE.Vector2(0, 166);
export const MARKET_RADIUS = 27;
export const MARKET_GATE_Z = 138;

export const RUIN = new THREE.Vector2(-21, 127);
/** The ruin door faces east, toward the path. */
export const RUIN_FACING = Math.PI / 2;

/** Hand-placed control points for the winding path, south to north. */
const PATH_POINTS = [
  [2, 8],
  [5, 24],
  [-3, 42],
  [-10, 58],
  [-6, 76],
  [6, 92],
  [9, 108],
  [3, 124],
  [0, 136],
  [0, 145],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

const pathCurve = new THREE.CatmullRomCurve3(PATH_POINTS);
export const PATH_SAMPLES = pathCurve.getSpacedPoints(260).map((p) => new THREE.Vector2(p.x, p.z));

/** Distance from (x, z) to the centre line of the path. */
export function pathDistance(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < PATH_SAMPLES.length - 1; i++) {
    const a = PATH_SAMPLES[i];
    const b = PATH_SAMPLES[i + 1];
    // Cheap reject: segments are short, so skip ones far away.
    if (Math.abs(a.y - z) > 12 && Math.abs(b.y - z) > 12) continue;
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
    const dx = x - (a.x + abx * t);
    const dz = z - (a.y + abz * t);
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

/** The gentle climb from the crash site up to the market plateau. */
function baseElevation(z: number) {
  return smoothstep(12, 132, z) * 6;
}

export const MARKET_HEIGHT = baseElevation(MARKET.y);

/** Terrain height everywhere in the level. Collision and rendering share it. */
export function terrainHeight(x: number, z: number) {
  const base = baseElevation(z);
  const hills = fbm(x * 0.035, z * 0.035, 4, 3) * 5 + fbm(x * 0.12, z * 0.12, 2, 9) * 0.6;
  const nearPath = smoothstep(3.5, 13, pathDistance(x, z));
  let h = base + Math.max(hills, -1.5) * nearPath;

  // Flatten the crash site and the market plateau.
  const dCrash = Math.hypot(x - CRASH.x, z - CRASH.y);
  h = THREE.MathUtils.lerp(base - 0.2, h, smoothstep(16, 26, dCrash));
  const dMarket = Math.hypot(x - MARKET.x, z - MARKET.y);
  h = THREE.MathUtils.lerp(MARKET_HEIGHT, h, smoothstep(MARKET_RADIUS + 2, MARKET_RADIUS + 12, dMarket));

  // The hill the ruin is dug into.
  const dRuin = Math.hypot(x - (RUIN.x - 9), z - RUIN.y);
  h += (1 - smoothstep(4, 15, dRuin)) * 7;

  // Ridges along the edges of the playable area.
  const edgeX = Math.max(0, Math.abs(x) - 36);
  const edgeZ = Math.max(0, BOUNDS.minZ + 12 - z, z - (BOUNDS.maxZ - 12));
  h += edgeX * edgeX * 0.035 + edgeZ * edgeZ * 0.035;
  return h;
}
