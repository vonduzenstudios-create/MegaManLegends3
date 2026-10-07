import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Three-band lighting ramp used by every toon material.
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const materialCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ color, gradientMap });
    if (opts.emissive !== undefined) mat.emissive = new THREE.Color(opts.emissive);
    materialCache.set(key, mat);
  }
  return mat;
}

const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.025 }, color: { value: new THREE.Color(0x1a1a24) } },
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      // Scale with distance so lines keep a similar on-screen width.
      mv.xyz += n * thickness * clamp(-mv.z * 0.12, 0.6, 3.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }
  `,
  side: THREE.BackSide,
});

const hullCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

// Inverted-hull geometry with welded, averaged normals so hard-edged
// primitives (boxes, cylinders) don't crack open at their corners.
function hullGeometry(geo: THREE.BufferGeometry) {
  let hull = hullCache.get(geo);
  if (!hull) {
    const stripped = new THREE.BufferGeometry();
    stripped.setAttribute('position', geo.getAttribute('position'));
    if (geo.index) stripped.setIndex(geo.index);
    hull = mergeVertices(stripped, 1e-4);
    hull.computeVertexNormals();
    hullCache.set(geo, hull);
  }
  return hull;
}

/** A toon-shaded mesh with an ink outline. */
export function toonMesh(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: { outline?: boolean; emissive?: THREE.ColorRepresentation; castShadow?: boolean } = {},
) {
  const mesh = new THREE.Mesh(geo, toon(color, opts));
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = true;
  if (opts.outline ?? true) {
    const hull = new THREE.Mesh(hullGeometry(geo), outlineMaterial);
    hull.raycast = () => {};
    mesh.add(hull);
  }
  return mesh;
}
