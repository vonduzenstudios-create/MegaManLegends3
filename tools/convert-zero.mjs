// One-off: turns the purchased Zero.fbx into the trimmed GLB the game loads.
//   node tools/convert-zero.mjs path/to/Zero.fbx public/models/zero.glb
// Drops the baked animation clips (the game animates the rig in code),
// merges the 300+ material groups down to one draw per material and
// bakes the mesh's stray scale into the vertices.
import fs from 'fs';

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type};base64,${Buffer.from(r).toString('base64')}`;
      this.onloadend?.(); this.onload?.({ target: this });
    });
  }
};

const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
// The eye texture isn't packed in the FBX; the game paints its own.
THREE.TextureLoader.prototype.load = () => new THREE.Texture();

const [src, dst] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const scene = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
scene.animations = [];

scene.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  const g = o.geometry;
  // Re-sort the index so each material is one contiguous group.
  const idx = g.index ? Array.from(g.index.array) : [...Array(g.attributes.position.count).keys()];
  const byMat = new Map();
  for (const grp of g.groups) {
    const list = byMat.get(grp.materialIndex) ?? [];
    for (let i = grp.start; i < grp.start + grp.count; i++) list.push(idx[i]);
    byMat.set(grp.materialIndex, list);
  }
  const mats = [].concat(o.material);
  const order = [...byMat.keys()].sort((a, b) => a - b);
  const newIdx = [];
  g.clearGroups();
  order.forEach((m, i) => {
    g.addGroup(newIdx.length, byMat.get(m).length, i);
    newIdx.push(...byMat.get(m));
  });
  g.setIndex(newIdx);
  o.material = order.map((m) => {
    const old = mats[m];
    return new THREE.MeshStandardMaterial({ name: old.name.replace(/\.\d+$/, ''), color: old.color });
  });
  // Bake the mesh's own scale so bind matrices stay simple.
  if (!o.scale.equals(new THREE.Vector3(1, 1, 1))) {
    g.scale(o.scale.x, o.scale.y, o.scale.z);
    o.scale.set(1, 1, 1);
    o.updateMatrixWorld(true);
    o.bind(o.skeleton, o.matrixWorld);
  }
  console.log(`${o.name}: ${newIdx.length / 3} tris, ${order.length} materials`);
});

new GLTFExporter().parse(
  scene,
  (glb) => { fs.writeFileSync(dst, Buffer.from(glb)); console.log(`wrote ${dst} (${fs.statSync(dst).size} bytes)`); },
  (err) => { throw err; },
  { binary: true, onlyVisible: false },
);
