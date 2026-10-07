import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import { toonMesh } from '../engine/toon';

/**
 * Step 1 proving ground: flat grass, platforms to jump on, trees, and
 * a few crates. Replaced by the real level in step 2.
 */
export function buildTestArea(scene: THREE.Scene, world: CollisionWorld) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xbfe3ff, 40, 110);

  // Ground with gentle colour variation baked into vertex colours.
  const size = 140;
  const groundGeo = new THREE.PlaneGeometry(size, size, 70, 70);
  groundGeo.rotateX(-Math.PI / 2);
  const colors: number[] = [];
  const pos = groundGeo.getAttribute('position');
  const a = new THREE.Color(0x6cc24a);
  const b = new THREE.Color(0x58ad3c);
  const dirt = new THREE.Color(0xd9b97a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.31) * Math.cos(z * 0.27) + Math.sin((x + z) * 0.13);
    c.copy(a).lerp(b, n * 0.25 + 0.5);
    // A dirt path running north from the spawn point.
    const pathDist = Math.abs(x - Math.sin(z * 0.08) * 3);
    if (pathDist < 2.2 && z > -6) c.lerp(dirt, Math.min(1, (2.2 - pathDist) * 1.2));
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: groundGradient() });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
    const m = toonMesh(new THREE.BoxGeometry(w, h, d), color);
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    world.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w, h, d));
    return m;
  };

  // Stepping-stone platforms.
  box(8, 0, 6, 3, 0.6, 3, 0xc8b08a);
  box(11, 0, 9, 3, 1.4, 3, 0xb89f78);
  box(14, 0, 12.5, 3, 2.3, 3, 0xa88f68);
  box(14, 0, 17, 3, 3.2, 4, 0x98805a);
  // Low steps you can walk up without jumping.
  for (let i = 0; i < 5; i++) box(-9, 0, 4 + i * 0.9, 3, 0.25 * (i + 1), 0.9, 0xd2c09a);
  box(-9, 0, 9.5, 3, 1.25, 2, 0xd2c09a);

  // Crates.
  for (const [x, z, s] of [
    [-4, 12, 1],
    [-2.8, 12.2, 0.8],
    [5, -6, 1.1],
    [-12, -8, 1],
  ]) {
    const crate = box(x, 0, z, s, s, s, 0xb8763a);
    const lid = toonMesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), 0x8a5222, { outline: false });
    lid.position.y = s * 0.3;
    crate.add(lid);
  }

  // Walls around the edge so you can't run off the world.
  const edge = size / 2 - 10;
  box(0, 0, edge, size - 20, 4, 1, 0x9c8a6a);
  box(0, 0, -edge, size - 20, 4, 1, 0x9c8a6a);
  box(edge, 0, 0, 1, 4, size - 20, 0x9c8a6a);
  box(-edge, 0, 0, 1, 4, size - 20, 0x9c8a6a);

  // Trees.
  const rand = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 22 + rand() * 30;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    addTree(scene, world, x, z, 0.8 + rand() * 0.6);
  }

  // Clouds.
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = toonMesh(new THREE.SphereGeometry(3 + rand() * 2, 12, 8), 0xffffff, { outline: false, castShadow: false });
      puff.position.set(j * 3.5 - 5, rand() * 1.5, rand() * 2);
      cloud.add(puff);
    }
    cloud.scale.y = 0.45;
    const angle = rand() * Math.PI * 2;
    cloud.position.set(Math.cos(angle) * 70, 28 + rand() * 10, Math.sin(angle) * 70);
    scene.add(cloud);
  }
}

function addTree(scene: THREE.Scene, world: CollisionWorld, x: number, z: number, s: number) {
  const tree = new THREE.Group();
  const trunk = toonMesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2 * s, 8), 0x8a5a32);
  trunk.position.y = s;
  tree.add(trunk);
  for (let i = 0; i < 3; i++) {
    const leaves = toonMesh(new THREE.ConeGeometry((1.9 - i * 0.45) * s, 1.8 * s, 9), i % 2 ? 0x3f9a3a : 0x4fae44);
    leaves.position.y = (2.2 + i * 1.0) * s;
    tree.add(leaves);
  }
  tree.position.set(x, 0, z);
  scene.add(tree);
  world.addBox(new THREE.Vector3(x, s, z), new THREE.Vector3(0.6 * s, 2 * s, 0.6 * s));
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3d8fe6');
  grad.addColorStop(0.55, '#8cc8ff');
  grad.addColorStop(1, '#d8f0ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Small deterministic PRNG so the scenery is the same every load. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
