import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toon } from '../engine/toon';
import type { PlayerRig } from './playerModel';

/**
 * Zero, from a purchased rigged model (public/models/zero.glb, made from
 * the FBX by tools/convert-zero.mjs). It is the one piece of art in the
 * game that isn't generated in code.
 *
 * The rest of the game animates heroes by rotating plain joint groups
 * (PlayerRig). Zero gets the same groups as invisible proxies; every frame
 * their rotations are retargeted onto the matching Mixamo bones, so the
 * existing run, jump, kick and aim code drives him unchanged.
 */

const HEIGHT = 1.7;
const OUTLINE = 0.018;

const BONES = {
  body: 'mixamorigHips',
  torso: 'mixamorigSpine',
  head: 'mixamorigHead',
  armL: 'mixamorigLeftArm',
  armR: 'mixamorigRightArm',
  forearmL: 'mixamorigLeftForeArm',
  forearmR: 'mixamorigRightForeArm',
  legL: 'mixamorigLeftUpLeg',
  legR: 'mixamorigRightUpLeg',
  shinL: 'mixamorigLeftLeg',
  shinR: 'mixamorigRightLeg',
  ponytail: 'mixamorigHair001',
} as const;
type Joint = keyof typeof BONES;

// The model's eye decal pointed at a texture that didn't ship with the FBX.
const EYE_COLOR = 0x2a8a3e;

let template: THREE.Object3D | null = null;
const waiting: Array<() => void> = [];
new GLTFLoader().load(`${import.meta.env.BASE_URL}models/zero.glb`, (gltf) => {
  template = gltf.scene;
  for (const fn of waiting.splice(0)) fn();
});

function whenLoaded(fn: () => void) {
  if (template) fn();
  else waiting.push(fn);
}

const outlineMaterial = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a24, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.thickness = { value: OUTLINE };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float thickness;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        // Push the skinned hull out along its normal in view space, scaled
        // with distance like the outlines on the code-built meshes.
        vec3 outlineN = normalize(normalMatrix * objectNormal);
        mvPosition.xyz += outlineN * thickness * clamp(-mvPosition.z * 0.12, 0.6, 3.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  return mat;
})();

function group(parent: THREE.Object3D) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

export function buildZeroModel(): PlayerRig {
  const root = new THREE.Group();
  // Proxy joints, arranged like the code-built heroes so the animator and
  // the muzzle work before the model has finished loading.
  const body = group(root);
  body.position.y = 0.88;
  body.userData.baseY = 0.88;
  const torso = group(body);
  const head = group(torso);
  const armL = group(torso);
  const armR = group(torso);
  const forearmL = group(armL);
  const forearmR = group(armR);
  const legL = group(body);
  const legR = group(body);
  const shinL = group(legL);
  const shinR = group(legR);
  const ponytail = group(head);
  const muzzle = new THREE.Object3D();
  forearmL.add(muzzle);
  armL.position.set(0.2, 0.4, 0);
  armR.position.set(-0.2, 0.4, 0);
  forearmL.position.y = forearmR.position.y = -0.25;
  muzzle.position.y = -0.3;

  const rig: PlayerRig = { root, body, torso, head, armL, armR, forearmL, forearmR, legL, legR, shinL, shinR, muzzle, ponytail };
  whenLoaded(() => attachModel(rig));
  return rig;
}

interface Binding {
  proxy: THREE.Object3D;
  bone: THREE.Bone;
  restLocal: THREE.Quaternion;
  parentRest: THREE.Quaternion;
  parentRestInv: THREE.Quaternion;
}

function attachModel(rig: PlayerRig) {
  const model = cloneSkinned(template!);
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });

  // Fit to game scale: feet on the ground, HEIGHT tall, facing +Z.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = HEIGHT / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  rig.root.add(model);

  // Cel-shade: swap every material for the shared toon ramp and give each
  // skinned mesh an inverted-hull twin for the ink outline.
  for (const mesh of skinned) {
    const mats = ([] as THREE.Material[]).concat(mesh.material);
    const toonMats = mats.map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      return src.name.startsWith('Material') ? toon(EYE_COLOR) : toon(src.color);
    });
    mesh.material = Array.isArray(mesh.material) ? toonMats : toonMats[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    // A single material draws the whole geometry, ignoring its groups.
    const hull = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial);
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.frustumCulled = false;
    hull.raycast = () => {};
    mesh.parent!.add(hull);
    hull.position.copy(mesh.position);
    hull.quaternion.copy(mesh.quaternion);
    hull.scale.copy(mesh.scale);
  }

  const bone = (name: string) => {
    const b = model.getObjectByName(name);
    if (!b) throw new Error(`zero.glb is missing bone ${name}`);
    return b as THREE.Bone;
  };

  // Drop the arms from the T-pose to hang at the sides, so "rest" matches
  // the code-built heroes (arms down, rotation 0).
  for (const [arm, fore, side] of [
    ['mixamorigLeftArm', 'mixamorigLeftForeArm', 1],
    ['mixamorigRightArm', 'mixamorigRightForeArm', -1],
  ] as const) {
    rig.root.updateMatrixWorld(true);
    const a = bone(arm);
    const from = bone(fore).getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
    const to = new THREE.Vector3(side * 0.2, -1, 0).normalize();
    rotateInRootSpace(rig.root, a, new THREE.Quaternion().setFromUnitVectors(from, to));
  }
  rig.root.updateMatrixWorld(true);

  // Record rest orientations relative to the rig root, and move the proxy
  // pivots onto the bones so the muzzle and hit checks line up.
  const rootInv = rig.root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restInRoot = (o: THREE.Object3D) => rootInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const posInRoot = (o: THREE.Object3D) => rig.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

  const bindings: Binding[] = [];
  for (const joint of Object.keys(BONES) as Joint[]) {
    const proxy = rig[joint]!;
    const b = bone(BONES[joint]);
    const parentRest = restInRoot(b.parent!);
    bindings.push({ proxy, bone: b, restLocal: b.quaternion.clone(), parentRest, parentRestInv: parentRest.clone().invert() });
    proxy.parent!.updateMatrixWorld(true);
    proxy.position.copy(proxy.parent!.worldToLocal(rig.root.localToWorld(posInRoot(b))));
    proxy.updateMatrixWorld(true);
  }
  rig.body.userData.baseY = rig.body.position.y;

  // Muzzle just past the left palm.
  const hand = bone('mixamorigLeftHand');
  const handPos = posInRoot(hand);
  const elbow = posInRoot(bone('mixamorigLeftForeArm'));
  const tip = handPos.clone().addScaledVector(handPos.clone().sub(elbow).normalize(), 0.1);
  rig.muzzle.position.copy(rig.forearmL.worldToLocal(rig.root.localToWorld(tip)));

  const hips = bone(BONES.body);
  const hipsRest = hips.position.clone();
  const bodyRestY = rig.body.position.y;
  // Converts a root-space offset into the hips' parent space.
  const toHipsParent = new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().copy(rig.root.matrixWorld).invert().multiply(hips.parent!.matrixWorld).invert(),
  );
  const offset = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const sync = () => {
    for (const b of bindings) {
      // New local = parentRest⁻¹ · proxyRotation · parentRest · restLocal
      q.copy(b.parentRestInv).multiply(b.proxy.quaternion).multiply(b.parentRest).multiply(b.restLocal);
      b.bone.quaternion.copy(q);
    }
    offset.set(0, rig.body.position.y - bodyRestY, 0).applyMatrix3(toHipsParent);
    hips.position.copy(hipsRest).add(offset);
  };

  const base = rig.root.updateMatrixWorld.bind(rig.root);
  rig.root.updateMatrixWorld = (force?: boolean) => {
    sync();
    base(force);
  };
}

function rotateInRootSpace(root: THREE.Object3D, b: THREE.Object3D, delta: THREE.Quaternion) {
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const world = b.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = b.parent!.getWorldQuaternion(new THREE.Quaternion());
  // delta is in root space; convert to world, apply, then back to local.
  const deltaWorld = rootQ.clone().multiply(delta).multiply(rootQ.clone().invert());
  b.quaternion.copy(parentWorld.invert().multiply(deltaWorld.multiply(world)));
}
