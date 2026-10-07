import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes every mesh under `root` into one merged mesh per material, so a
 * level made of hundreds of primitives costs a handful of draw calls.
 * Only use for scenery that never moves.
 */
export function batchStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    let bucket = buckets.get(o.material);
    if (!bucket) {
      bucket = { geos: [], cast: false, receive: false };
      buckets.set(o.material, bucket);
    }
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    // Mirrored transforms flip winding; outlines rely on it being right.
    if (o.matrixWorld.determinant() < 0) flipWinding(geo);
    bucket.geos.push(geo);
    bucket.cast ||= o.castShadow;
    bucket.receive ||= o.receiveShadow;
  });

  const out = new THREE.Group();
  for (const [material, { geos, cast, receive }] of buckets) {
    const indexed = geos.filter((g) => g.index);
    const plain = geos.filter((g) => !g.index);
    for (const set of [indexed, plain]) {
      if (!set.length) continue;
      const merged = mergeGeometries(normalizeAttributes(set));
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.raycast = () => {};
      out.add(mesh);
    }
    for (const g of geos) g.dispose();
  }
  return out;
}

/** mergeGeometries needs identical attribute sets; keep the common ones. */
function normalizeAttributes(geos: THREE.BufferGeometry[]) {
  const common = Object.keys(geos[0].attributes).filter((name) => geos.every((g) => g.getAttribute(name)));
  for (const g of geos) {
    for (const name of Object.keys(g.attributes)) if (!common.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
  }
  return geos;
}

function flipWinding(geo: THREE.BufferGeometry) {
  const index = geo.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, a);
    }
  }
}
