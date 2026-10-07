import * as THREE from 'three';
import { fbm, mulberry32 } from '../../engine/noise';
import { BOUNDS, CRASH, MARKET, MARKET_RADIUS, pathDistance, terrainHeight } from './layout';

const GRASS_A = new THREE.Color(0x74c94e);
const GRASS_B = new THREE.Color(0x5aae3e);
const GRASS_DRY = new THREE.Color(0xa6c25a);
const DIRT = new THREE.Color(0xd8b878);
const DIRT_DARK = new THREE.Color(0xa8875a);
const SCORCH = new THREE.Color(0x5a4a3a);
const CLIFF = new THREE.Color(0x6f9448);

export function terrainGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([140, 205, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Heightfield mesh with grass, path dirt and cliff colours baked into vertices. */
export function buildTerrain() {
  const width = BOUNDS.maxX - BOUNDS.minX + 20;
  const depth = BOUNDS.maxZ - BOUNDS.minZ + 20;
  const geo = new THREE.PlaneGeometry(width, depth, Math.round(width), Math.round(depth));
  geo.rotateX(-Math.PI / 2);
  geo.translate((BOUNDS.minX + BOUNDS.maxX) / 2, 0, (BOUNDS.minZ + BOUNDS.maxZ) / 2);

  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    const n = fbm(x * 0.08, z * 0.08, 3, 21);
    c.copy(GRASS_A).lerp(GRASS_B, n * 0.6 + 0.5);
    c.lerp(GRASS_DRY, Math.max(0, fbm(x * 0.02, z * 0.02, 2, 5)) * 0.8);

    const pd = pathDistance(x, z);
    const edgeWobble = fbm(x * 0.5, z * 0.5, 2, 33) * 0.6;
    if (pd < 2.8 + edgeWobble) c.copy(DIRT).lerp(DIRT_DARK, Math.max(0, n) * 0.5);
    else if (pd < 3.4 + edgeWobble) c.lerp(DIRT, 0.45);

    const dCrash = Math.hypot(x - CRASH.x + 6, z - CRASH.y + 2);
    if (dCrash < 9) c.lerp(SCORCH, (1 - dCrash / 9) * 0.7);
    else if (dCrash < 15) c.lerp(DIRT, (1 - (dCrash - 9) / 6) * 0.5);

    // Steep ground reads as rock.
    const slope = Math.abs(terrainHeight(x + 0.5, z) - y) + Math.abs(terrainHeight(x, z + 0.5) - y);
    if (slope > 0.5) c.lerp(CLIFF, Math.min(0.8, (slope - 0.5) * 1.5));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: terrainGradient() }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Is this spot clear for scenery (not on the path, plaza or crash site)? */
export function openGround(x: number, z: number, margin = 0) {
  if (pathDistance(x, z) < 4 + margin) return false;
  if (Math.hypot(x - MARKET.x, z - MARKET.y) < MARKET_RADIUS + 3 + margin) return false;
  if (Math.hypot(x - CRASH.x, z - CRASH.y) < 15 + margin) return false;
  return true;
}

/** Instanced grass tufts and flowers scattered over open ground. */
export function buildGroundCover() {
  const group = new THREE.Group();
  const rand = mulberry32(42);

  // A tuft is three thin blades leaning outward.
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.ConeGeometry(0.06, 0.55, 3);
    blade.translate(0, 0.27, 0);
    blade.rotateZ((i - 1) * 0.35);
    blade.rotateY((i * Math.PI * 2) / 3);
    blades.push(blade);
  }
  const tuftGeo = mergeSimple(blades);
  const tuftMat = new THREE.MeshToonMaterial({ color: 0x4c9a34, gradientMap: terrainGradient() });

  const flowerGeo = new THREE.SphereGeometry(0.09, 6, 4);
  flowerGeo.translate(0, 0.32, 0);
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4);
  stemGeo.translate(0, 0.15, 0);

  const TUFTS = 2400;
  const FLOWERS = 500;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshToonMaterial({ gradientMap: terrainGradient() }), FLOWERS);
  const stems = new THREE.InstancedMesh(stemGeo, tuftMat, FLOWERS);
  const flowerColors = [0xffffff, 0xffe04a, 0xff7aa8, 0xb48cff, 0xff8a3a].map((h) => new THREE.Color(h));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const place = (count: number, margin: number, fn: (i: number) => void) => {
    let placed = 0;
    while (placed < count) {
      p.set(
        BOUNDS.minX + 6 + rand() * (BOUNDS.maxX - BOUNDS.minX - 12),
        0,
        BOUNDS.minZ + 6 + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 12),
      );
      // Grass hugs the path edges too; only keep it off the dirt itself.
      if (pathDistance(p.x, p.z) < 3 + margin) continue;
      if (Math.hypot(p.x - MARKET.x, p.z - MARKET.y) < MARKET_RADIUS + margin) continue;
      p.y = terrainHeight(p.x, p.z);
      fn(placed++);
    }
  };

  place(TUFTS, 0, (i) => {
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    s.setScalar(0.7 + rand() * 0.8);
    tufts.setMatrixAt(i, m.compose(p, q, s));
  });
  place(FLOWERS, 0.5, (i) => {
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    s.setScalar(0.8 + rand() * 0.5);
    m.compose(p, q, s);
    flowers.setMatrixAt(i, m);
    stems.setMatrixAt(i, m);
    flowers.setColorAt(i, flowerColors[Math.floor(rand() * flowerColors.length)]);
  });

  for (const im of [tufts, flowers, stems]) {
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  }
  return group;
}

function mergeSimple(geos: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    positions.push(...(ng.getAttribute('position').array as Float32Array));
    normals.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return out;
}
