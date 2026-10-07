import * as THREE from 'three';
import { toonMesh } from '../../engine/toon';

// Reusable scenery pieces. Each builder returns a group with its origin on
// the ground; callers position it and add colliders.

export function tree(scale = 1, variant = 0) {
  const g = new THREE.Group();
  const trunk = toonMesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), 0x8a5a32);
  trunk.position.y = 1.1;
  g.add(trunk);
  if (variant % 2 === 0) {
    // Round broadleaf: a cluster of leafy balls.
    const leaf = [0x4fae44, 0x5cbf4a, 0x45a03c];
    const balls: [number, number, number, number][] = [
      [0, 3.0, 0, 1.4],
      [0.9, 2.6, 0.3, 1.0],
      [-0.8, 2.7, -0.2, 1.05],
      [0.1, 3.7, -0.5, 0.9],
      [-0.2, 2.5, 0.9, 0.9],
    ];
    balls.forEach(([x, y, z, r], i) => {
      const b = toonMesh(new THREE.IcosahedronGeometry(r, 1), leaf[i % leaf.length]);
      b.position.set(x, y, z);
      g.add(b);
    });
  } else {
    for (let i = 0; i < 3; i++) {
      const cone = toonMesh(new THREE.ConeGeometry(1.7 - i * 0.4, 1.7, 9), i % 2 ? 0x3f9a3a : 0x4fae44);
      cone.position.y = 2.2 + i * 0.95;
      g.add(cone);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function rock(size = 1, color = 0xa8a090) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const pos = geo.getAttribute('position');
  // Squash and jitter so no two rocks look identical.
  for (let i = 0; i < pos.count; i++) {
    const k = 0.85 + (Math.sin(i * 12.9898 + size * 78.233) * 43758.5453 % 1) * 0.15;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * 0.7 * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = toonMesh(geo, color);
  m.position.y = size * 0.35;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A run of wooden fence from a to b (ground heights supplied by caller). */
export function fence(a: THREE.Vector3, b: THREE.Vector3) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const posts = Math.max(2, Math.round(len / 2) + 1);
  for (let i = 0; i < posts; i++) {
    const p = a.clone().lerp(b, i / (posts - 1));
    const post = toonMesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), 0x9a6a3c);
    post.position.set(p.x, p.y + 0.5, p.z);
    g.add(post);
  }
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
  for (const h of [0.45, 0.8]) {
    const rail = toonMesh(new THREE.BoxGeometry(0.08, 0.12, len), 0xb07a46);
    rail.position.set(mid.x, mid.y + h, mid.z);
    rail.rotation.set(-pitch, yaw, 0, 'YXZ');
    g.add(rail);
  }
  return g;
}

export function lampPost() {
  const g = new THREE.Group();
  const pole = toonMesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), 0x3c4048);
  pole.position.y = 1.6;
  const arm = toonMesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), 0x3c4048);
  arm.position.set(0, 3.1, 0.25);
  const lamp = toonMesh(new THREE.SphereGeometry(0.2, 10, 8), 0xfff2b0, { emissive: 0x806a20 });
  lamp.position.set(0, 2.95, 0.5);
  const base = toonMesh(new THREE.CylinderGeometry(0.2, 0.25, 0.25, 8), 0x3c4048);
  base.position.y = 0.12;
  g.add(pole, arm, lamp, base);
  return g;
}

export function signpost(color = 0xb07a46) {
  const g = new THREE.Group();
  const post = toonMesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), 0x8a5a32);
  post.position.y = 0.8;
  const board = toonMesh(new THREE.BoxGeometry(1.2, 0.45, 0.08), color);
  board.position.set(0, 1.45, 0.08);
  g.add(post, board);
  return g;
}

/** A canvas texture of horizontal stripes, for awnings and banners. */
export function stripeTexture(a: string, b: string, stripes = 6) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 64) / stripes, 0, 64 / stripes + 1, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
