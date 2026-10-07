import * as THREE from 'three';
import type { CollisionWorld } from '../../engine/collision';
import { toon, toonMesh } from '../../engine/toon';
import { mulberry32 } from '../../engine/noise';
import { lampPost, stripeTexture } from './props';
import { MARKET, MARKET_GATE_Z, MARKET_HEIGHT } from './layout';

/** Half the width of the square town plaza. */
export const PLAZA_HALF = 20;
export const FOUNTAIN_RADIUS = 2.9;

interface ShopSpec {
  x: number;
  z: number;
  /** Which way the shop front faces. */
  face: 'n' | 's' | 'e' | 'w';
  w: number;
  h: number;
  wall: number;
  roof: number;
  awning: [string, string];
  sign: string;
}

const SHOPS: ShopSpec[] = [
  { x: -14, z: 23, face: 's', w: 7, h: 4.2, wall: 0xf4e3c3, roof: 0xd04a32, awning: ['#d84a3a', '#fff4e0'], sign: 'APPLES' },
  { x: -4.5, z: 23, face: 's', w: 6, h: 5.4, wall: 0xcfe2f2, roof: 0x3a7ab8, awning: ['#3a7ab8', '#ffffff'], sign: 'INN' },
  { x: 5.5, z: 23, face: 's', w: 6.5, h: 4.4, wall: 0xf2d0b4, roof: 0x8a5a9a, awning: ['#8a5a9a', '#fff0f8'], sign: 'BAKERY' },
  { x: 15, z: 23, face: 's', w: 6, h: 4.0, wall: 0xe8eccf, roof: 0x4a9a5a, awning: ['#4a9a5a', '#f8fff0'], sign: 'CAFE' },
  { x: 23, z: 10, face: 'w', w: 7, h: 4.6, wall: 0xf0d8a8, roof: 0xc87a2a, awning: ['#c87a2a', '#fff8e8'], sign: 'PARTS' },
  { x: 23, z: -2, face: 'w', w: 6, h: 4.0, wall: 0xd8d8e8, roof: 0x5a5a8a, awning: ['#5a5a8a', '#ffffff'], sign: 'TOOLS' },
  { x: 23, z: -13, face: 'w', w: 6.5, h: 4.4, wall: 0xf4e3c3, roof: 0xb83a4a, awning: ['#b83a4a', '#fff4e0'], sign: 'JUNK' },
  { x: -23, z: 10, face: 'e', w: 7, h: 5.0, wall: 0xe0f0e0, roof: 0x2a8a8a, awning: ['#2a8a8a', '#f0ffff'], sign: 'CLOTHES' },
  { x: -23, z: -2, face: 'e', w: 6, h: 4.0, wall: 0xf2d0b4, roof: 0xd04a32, awning: ['#d04a32', '#ffffff'], sign: 'BOOKS' },
  { x: -23, z: -13, face: 'e', w: 6.5, h: 4.3, wall: 0xcfe2f2, roof: 0x7a5a3a, awning: ['#7a5a3a', '#fff0e0'], sign: 'SMITH' },
  { x: -14.5, z: -23, face: 'n', w: 8, h: 4.4, wall: 0xf0e6d0, roof: 0x6a8a3a, awning: ['#6a8a3a', '#ffffff'], sign: 'POST' },
  { x: 14.5, z: -23, face: 'n', w: 8, h: 4.6, wall: 0xe8d8c8, roof: 0xc04a6a, awning: ['#c04a6a', '#fff0f4'], sign: 'TOYS' },
];

const FACE_YAW = { s: Math.PI, n: 0, e: Math.PI / 2, w: -Math.PI / 2 };
const DEPTH = 5;

export function textTexture(text: string, bg: string, fg: string, w = 256, h = 64) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.55)}px "Trebuchet MS", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cobbleTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9c8f7c';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(5);
  const rows = 8;
  const cell = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < rows + 1; col++) {
      const x = col * cell - (r % 2 ? cell / 2 : 0);
      const y = r * cell;
      const shade = 190 + Math.floor(rand() * 40);
      g.fillStyle = `rgb(${shade}, ${shade - 12}, ${shade - 30})`;
      g.beginPath();
      g.roundRect(x + 3, y + 3, cell - 6, cell - 6, 8);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.anisotropy = 8;
  return tex;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, outline = true) {
  const m = toonMesh(new THREE.BoxGeometry(w, h, d), color, { outline });
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A shop with its front at local +Z and its footprint centred on the origin. */
function shop(spec: ShopSpec) {
  const g = new THREE.Group();
  const { w, h } = spec;
  box(g, w, h + 2, DEPTH, spec.wall, 0, h / 2 - 1, 0);
  // Foundation stripe and corner posts.
  box(g, w + 0.1, 0.5, DEPTH + 0.1, 0x8a7a64, 0, 0.25, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.3, h, 0.3, 0x8a5a32, sx * (w / 2), h / 2, sz * (DEPTH / 2));

  // Roof: a gable made from a three-sided prism.
  const roofGeo = new THREE.CylinderGeometry(1, 1, w + 0.8, 3, 1);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.rotateX(-Math.PI / 2); // apex up, ridge along X
  const roof = toonMesh(roofGeo, spec.roof);
  roof.scale.set(1, 1.6, (DEPTH + 0.8) / 1.73);
  roof.position.y = h + 0.8;
  g.add(roof);
  // Chimney.
  box(g, 0.6, 1.4, 0.6, 0x9a6a5a, w * 0.25, h + 1.6, -0.8);

  // Door, windows and shop sign on the front.
  const front = DEPTH / 2;
  box(g, 1.2, 2.1, 0.12, 0x6a4024, 0, 1.05, front + 0.03);
  box(g, 0.1, 0.1, 0.1, 0xf2c230, 0.4, 1.0, front + 0.12, false);
  for (const sx of [-1, 1]) {
    const wx = sx * (w / 2 - 1.3);
    box(g, 1.3, 1.1, 0.1, 0x2d4e7a, wx, 1.7, front + 0.03);
    box(g, 1.5, 0.12, 0.2, 0x8a5a32, wx, 1.1, front + 0.08);
    box(g, 0.08, 1.1, 0.12, 0xf4f4f4, wx, 1.7, front + 0.09, false);
    // Upstairs window.
    if (h > 4.2) box(g, 0.9, 0.9, 0.1, 0x2d4e7a, wx, h - 0.9, front + 0.03);
  }

  // Striped awning sloping out over the front.
  const awningMat = new THREE.MeshToonMaterial({ map: stripeTexture(spec.awning[0], spec.awning[1], 8), gradientMap: toon(0xffffff).gradientMap });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.08, 1.6), awningMat);
  awning.position.set(0, 2.75, front + 0.75);
  awning.rotation.x = 0.35;
  awning.castShadow = true;
  g.add(awning);

  const signMat = new THREE.MeshBasicMaterial({ map: textTexture(spec.sign, '#3a2a1a', '#ffe9b0') });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), signMat);
  sign.position.set(0, 3.45, front + 0.08);
  g.add(sign);
  return g;
}

function appleStall(rand: () => number) {
  const g = new THREE.Group();
  box(g, 2.6, 0.9, 1.2, 0xa8743c, 0, 0.45, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.1, 2.2, 0.1, 0x8a5a32, sx * 1.25, 1.1, sz * 0.55);
  const canopyMat = new THREE.MeshToonMaterial({ map: stripeTexture('#d84a3a', '#fff4e0', 6), gradientMap: toon(0xffffff).gradientMap });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.7), canopyMat);
  canopy.position.y = 2.25;
  canopy.castShadow = true;
  g.add(canopy);
  // Crates heaped with apples.
  for (const cx of [-0.75, 0.75]) {
    box(g, 1.0, 0.3, 0.8, 0x8a5222, cx, 1.05, 0);
    for (let i = 0; i < 9; i++) {
      const a = toonMesh(new THREE.SphereGeometry(0.11, 8, 6), rand() < 0.8 ? 0xd8281e : 0x8ac83a, { outline: false });
      a.position.set(cx + (rand() - 0.5) * 0.75, 1.27 + rand() * 0.08, (rand() - 0.5) * 0.55);
      g.add(a);
    }
  }
  return g;
}

function bench() {
  const g = new THREE.Group();
  box(g, 2, 0.12, 0.6, 0xb07a46, 0, 0.5, 0);
  box(g, 2, 0.5, 0.1, 0xb07a46, 0, 0.85, -0.28);
  for (const sx of [-0.8, 0.8]) box(g, 0.12, 0.5, 0.5, 0x3c4048, sx, 0.25, 0);
  return g;
}

function barrel() {
  const g = new THREE.Group();
  const b = toonMesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), 0x9a6a3c);
  b.position.y = 0.5;
  const hoop = toonMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12), 0x4a4a52, { outline: false });
  hoop.position.y = 0.75;
  g.add(b, hoop);
  return g;
}

/** Water spray for the fountain, animated each frame. */
export class FountainSpray {
  readonly group = new THREE.Group();
  private drops: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }[] = [];
  private readonly origin: THREE.Vector3;
  private readonly floorY: number;
  private readonly water: THREE.Mesh;

  constructor(origin: THREE.Vector3, floorY: number, water: THREE.Mesh) {
    this.origin = origin;
    this.floorY = floorY;
    this.water = water;
    const geo = new THREE.SphereGeometry(0.07, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      const drop = { mesh, vel: new THREE.Vector3(), age: 0 };
      this.reset(drop);
      drop.age = Math.random() * 1.2;
      this.drops.push(drop);
    }
  }

  private reset(d: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }) {
    const a = Math.random() * Math.PI * 2;
    d.mesh.position.copy(this.origin);
    d.vel.set(Math.cos(a) * 1.3, 3.2 + Math.random() * 0.8, Math.sin(a) * 1.3);
    d.age = 0;
  }

  update(dt: number, time: number) {
    for (const d of this.drops) {
      d.age += dt;
      d.vel.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < this.floorY) this.reset(d);
    }
    this.water.position.y = this.floorY + Math.sin(time * 2) * 0.015;
  }
}

/** Builds Apple Market around the plaza centre and registers its colliders. */
export function buildMarket(world: CollisionWorld) {
  const scenery = new THREE.Group();
  const H = MARKET_HEIGHT;
  const cx = MARKET.x;
  const cz = MARKET.y;
  const rand = mulberry32(99);

  const collide = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    world.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w, h, d));

  // Cobbled plaza.
  const plazaMat = new THREE.MeshToonMaterial({ map: cobbleTexture(), gradientMap: toon(0xffffff).gradientMap });
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_HALF * 2 + 6, PLAZA_HALF * 2 + 6), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(cx, H + 0.04, cz);
  plaza.receiveShadow = true;
  scenery.add(plaza);
  // Cobbled lane through the south entrance down to the gate.
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(6, cz - PLAZA_HALF - MARKET_GATE_Z + 2), plazaMat.clone());
  (lane.material as THREE.MeshToonMaterial).map = cobbleTexture();
  (lane.material as THREE.MeshToonMaterial).map!.repeat.set(1.5, 2.5);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(cx, H + 0.03, (MARKET_GATE_Z + cz - PLAZA_HALF) / 2 - 1);
  lane.receiveShadow = true;
  scenery.add(lane);

  // Shops.
  for (const spec of SHOPS) {
    const s = shop(spec);
    s.position.set(cx + spec.x, H, cz + spec.z);
    s.rotation.y = FACE_YAW[spec.face];
    scenery.add(s);
    const alongX = spec.face === 'n' || spec.face === 's';
    collide(cx + spec.x, H - 1, cz + spec.z, alongX ? spec.w : DEPTH, spec.h + 3, alongX ? DEPTH : spec.w);
  }

  // Fountain in the middle.
  const fountain = new THREE.Group();
  const basin = toonMesh(new THREE.CylinderGeometry(FOUNTAIN_RADIUS + 0.3, FOUNTAIN_RADIUS + 0.5, 0.7, 24), 0xc8c0b0);
  basin.position.y = 0.35;
  const inner = toonMesh(new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS, 0.2, 24), 0x7a7266, { outline: false });
  inner.position.y = 0.62;
  const pillar = toonMesh(new THREE.CylinderGeometry(0.35, 0.5, 2.0, 12), 0xc8c0b0);
  pillar.position.y = 1.2;
  const bowl = toonMesh(new THREE.CylinderGeometry(1.1, 0.4, 0.4, 16), 0xc8c0b0);
  bowl.position.y = 2.2;
  const apple = toonMesh(new THREE.SphereGeometry(0.45, 14, 10), 0xd8281e);
  apple.position.y = 2.75;
  const leaf = toonMesh(new THREE.ConeGeometry(0.12, 0.35, 6), 0x4fae44);
  leaf.position.set(0.12, 3.25, 0);
  leaf.rotation.z = -0.6;
  fountain.add(basin, inner, pillar, bowl, apple, leaf);
  fountain.position.set(cx, H, cz);
  scenery.add(fountain);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(FOUNTAIN_RADIUS - 0.05, 32),
    new THREE.MeshToonMaterial({ color: 0x6cc8f0, transparent: true, opacity: 0.85, gradientMap: toon(0xffffff).gradientMap }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, H + 0.6, cz);
  const spray = new FountainSpray(new THREE.Vector3(cx, H + 2.5, cz), H + 0.6, water);
  // The rim is a low wall you can hop onto; the pillar blocks.
  for (const [dx, dz, w, d] of [
    [0, FOUNTAIN_RADIUS, FOUNTAIN_RADIUS * 2 + 0.6, 0.6],
    [0, -FOUNTAIN_RADIUS, FOUNTAIN_RADIUS * 2 + 0.6, 0.6],
    [FOUNTAIN_RADIUS, 0, 0.6, FOUNTAIN_RADIUS * 2],
    [-FOUNTAIN_RADIUS, 0, 0.6, FOUNTAIN_RADIUS * 2],
  ]) {
    collide(cx + dx, H, cz + dz, w, 0.7, d);
  }
  collide(cx, H, cz, 1.0, 3.2, 1.0);

  // Apple stalls, benches, barrels and lamps.
  for (const [x, z, yaw] of [
    [-9, 13, Math.PI],
    [-3, 13, Math.PI],
    [12, 6, -Math.PI / 2],
  ]) {
    const st = appleStall(rand);
    st.position.set(cx + x, H, cz + z);
    st.rotation.y = yaw;
    scenery.add(st);
    const alongX = Math.abs(Math.sin(yaw)) < 0.5;
    collide(cx + x, H, cz + z, alongX ? 2.6 : 1.2, 0.9, alongX ? 1.2 : 2.6);
  }
  for (const [x, z, yaw] of [
    [-6, -6, Math.PI / 4],
    [6, -6, -Math.PI / 4],
    [-7, 6, (3 * Math.PI) / 4],
  ]) {
    const b = bench();
    b.position.set(cx + x, H, cz + z);
    b.rotation.y = yaw;
    scenery.add(b);
  }
  for (const [x, z] of [
    [18.5, 15],
    [19, 13.8],
    [-18.5, -17],
    [17.5, -7.5],
    [-18.6, 4],
  ]) {
    const b = barrel();
    b.position.set(cx + x, H, cz + z);
    scenery.add(b);
    collide(cx + x, H, cz + z, 0.8, 1.0, 0.8);
  }
  for (const [x, z] of [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5],
    [-4, -19],
    [4, -19],
  ]) {
    const l = lampPost();
    l.position.set(cx + x, H, cz + z);
    l.rotation.y = Math.atan2(-x, -z);
    scenery.add(l);
    collide(cx + x, H, cz + z, 0.3, 3.2, 0.3);
  }

  // Bunting strung across the plaza.
  const flagColors = [0xd84a3a, 0xf2c230, 0x3a7ab8, 0x4a9a5a, 0xffffff];
  for (const [ax, az, bx, bz] of [
    [-20, -20, 20, 20],
    [20, -20, -20, 20],
  ]) {
    const n = 26;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const sag = Math.sin(t * Math.PI) * 1.4;
      const flagGeo = new THREE.ConeGeometry(0.22, 0.5, 3);
      flagGeo.rotateX(Math.PI);
      const flag = toonMesh(flagGeo, flagColors[i % flagColors.length], { outline: false, castShadow: false });
      flag.position.set(cx + ax + (bx - ax) * t, H + 6.2 - sag, cz + az + (bz - az) * t);
      scenery.add(flag);
    }
  }

  // Market gate at the end of the path.
  const gate = new THREE.Group();
  for (const sx of [-1, 1]) {
    box(gate, 1.1, 5, 1.1, 0xc8b89a, sx * 3.6, 2.5, 0);
    box(gate, 1.4, 0.4, 1.4, 0x9a8a6c, sx * 3.6, 5.1, 0);
    collide(cx + sx * 3.6, H - 2, MARKET_GATE_Z, 1.1, 7, 1.1);
  }
  box(gate, 8.6, 0.6, 0.8, 0x8a5a32, 0, 4.4, 0);
  const gateSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.1),
    new THREE.MeshBasicMaterial({ map: textTexture('APPLE MARKET', '#c8402c', '#fff4d8', 512, 110) }),
  );
  for (const s of [-1, 1]) {
    const face = gateSign.clone();
    face.position.set(0, 3.55, s * 0.08);
    face.rotation.y = s < 0 ? Math.PI : 0;
    gate.add(face);
  }
  box(gate, 5.4, 1.3, 0.12, 0x6a4024, 0, 3.55, 0);
  gate.position.set(cx, H, MARKET_GATE_Z);
  scenery.add(gate);

  return { scenery, water, spray, fountainCenter: new THREE.Vector3(cx, H, cz) };
}
