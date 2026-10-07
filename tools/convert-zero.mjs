// One-off: turns the purchased Zero.fbx into the trimmed GLB the game loads.
//   node tools/convert-zero.mjs path/to/Zero.fbx public/models/zero.glb
// Keeps the model's animation clips (idle, run, jump, attacks...), pruned
// to the bones that matter and made in-place, merges the 300+ material
// groups down to one draw per material and bakes the mesh's stray scale
// into the vertices.
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

// --- Animation clips -------------------------------------------------------
// Each clip appears twice (once with an "Armature.002|" prefix); keep one of
// each under a short name the game refers to.
const CLIPS = {
  'Idle  Stand - Final': 'idle',
  'Idle - Look around': 'idleLook',
  'Fast Run - Final': 'run',
  'Jumping Up': 'jump',
  'Falling To Landing - Final': 'land',
  'Attack 01': 'attack1',
  'Attack 02': 'attack2',
};
// Bones too small to read at game distance; their tracks are dropped.
const SKIP_BONE = /Hand(Index|Thumb|Ring|Middle|Pinky)|_end$|Toe_End|HeadTop/;
// Hips height in the idle clip; higher values are flight the game handles itself.
const idleHips = scene.animations.find((c) => c.name === 'Idle  Stand - Final').tracks.find((t) => t.name === 'mixamorigHips.position');
let hipsRestY = -Infinity;
for (let i = 1; i < idleHips.values.length; i += 3) hipsRestY = Math.max(hipsRestY, idleHips.values[i]);

// The clips were recorded facing different ways; turn each so the hips face
// +Z on the first frame, like the rest pose.
const hipsBone = scene.getObjectByName('mixamorigHips');
const hipsRestQ = hipsBone.quaternion.clone();
const faceForward = (track) => {
  const v = track.values;
  const q0 = new THREE.Quaternion().fromArray(v, 0);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q0.clone().multiply(hipsRestQ.clone().invert()));
  const yaw = Math.atan2(f.x, f.z);
  const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const q = new THREE.Quaternion();
  for (let i = 0; i < v.length; i += 4) {
    q.fromArray(v, i).premultiply(fix).toArray(v, i);
  }
};

const seen = new Set();
scene.animations = scene.animations
  .filter((c) => {
    const name = c.name.replace(/^Armature\.\d+\|/, '');
    if (!CLIPS[name] || seen.has(name)) return false;
    seen.add(name);
    c.name = name;
    return true;
  })
  .map((clip) => {
    const tracks = [];
    for (const t of clip.tracks) {
      const [node, prop] = t.name.split('.');
      if (!node.startsWith('mixamorig') || SKIP_BONE.test(node)) continue;
      if (prop === 'scale') continue;
      if (prop === 'position' && node !== 'mixamorigHips') continue;
      if (prop === 'position') {
        // In place: no travel, and no flight above the standing height.
        const v = t.values;
        for (let i = 0; i < v.length; i += 3) {
          v[i] = 0;
          v[i + 1] = Math.min(v[i + 1], hipsRestY);
          v[i + 2] = 0;
        }
      }
      if (prop === 'quaternion' && node === 'mixamorigHips') faceForward(t);
      tracks.push(t);
    }
    const out = new THREE.AnimationClip(CLIPS[clip.name], clip.duration, tracks);
    console.log(`clip ${out.name}: ${out.duration.toFixed(2)}s, ${tracks.length} tracks`);
    return out;
  });

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
  { binary: true, onlyVisible: false, animations: scene.animations },
);
