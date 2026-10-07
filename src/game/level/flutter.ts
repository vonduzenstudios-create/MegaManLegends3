import * as THREE from 'three';
import { toonMesh } from '../../engine/toon';

const HULL = 0xf1e9d6;
const TRIM = 0xc8402c;
const DARK = 0x3b4a5c;
const GLASS = 0x2d4e7a;
const METAL = 0x8a929c;

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) {
  const m = toonMesh(geo, color);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function propeller(parent: THREE.Object3D, x: number, y: number, z: number, bent = 0) {
  const hub = add(parent, new THREE.ConeGeometry(0.35, 0.7, 10), METAL, x, y, z);
  hub.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const blade = add(parent, new THREE.BoxGeometry(0.3, 1.6, 0.08), DARK, x, y, z - 0.1);
    blade.geometry.translate(0, 0.8, 0);
    blade.rotation.z = (i * Math.PI * 2) / 3 + bent;
    blade.rotation.y = 0.3 + (i === 0 ? bent : 0);
  }
}

/**
 * The Flutter, Mega Man's airship, built from primitives. Local +Z is the
 * nose; the ship is about 22 units long. Returns the model plus local
 * points where smoke should rise from the damaged engine.
 */
export function buildFlutter() {
  const ship = new THREE.Group();

  // Hull: a long rounded body with a red keel.
  const hull = add(ship, new THREE.SphereGeometry(1, 28, 18), HULL, 0, 1.6, 0);
  hull.scale.set(3.6, 2.2, 10.5);
  const keel = add(ship, new THREE.SphereGeometry(1, 24, 12), TRIM, 0, 0.9, -0.3);
  keel.scale.set(3.0, 1.4, 9.6);
  // Red racing stripe around the waist.
  const stripe = add(ship, new THREE.CylinderGeometry(1, 1, 0.35, 28), TRIM, 0, 1.6, 0);
  stripe.scale.set(3.65, 1, 10.55);

  // Upper deck and bridge.
  add(ship, new THREE.BoxGeometry(3.6, 0.5, 11), HULL, 0, 3.6, -1);
  const bridge = add(ship, new THREE.BoxGeometry(2.6, 1.4, 3.2), HULL, 0, 4.4, -4.2);
  bridge.rotation.x = -0.05;
  add(ship, new THREE.BoxGeometry(2.62, 0.45, 0.2), GLASS, 0, 4.6, -2.6);
  add(ship, new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), METAL, 0.8, 5.6, -4.6);

  // Cockpit windows across the nose.
  const windows = add(ship, new THREE.BoxGeometry(3.2, 0.7, 1.2), GLASS, 0, 2.6, 8.6);
  windows.rotation.x = 0.55;
  for (const s of [-1, 1]) {
    // Porthole row.
    for (let i = 0; i < 4; i++) {
      const port = add(ship, new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), GLASS, s * 3.45, 2.1, 3 - i * 2.4);
      port.rotation.z = Math.PI / 2;
      port.rotation.y = s * 0.12 * (i - 1);
    }
  }

  // Wings with engine pods.
  for (const s of [-1, 1]) {
    const wing = add(ship, new THREE.BoxGeometry(5, 0.35, 3.2), HULL, s * 5.4, 1.8, -1.5);
    wing.rotation.z = s * -0.08;
    add(ship, new THREE.BoxGeometry(5, 0.37, 0.4), TRIM, s * 5.4, 1.8, -0.1);
    const pod = add(ship, new THREE.CylinderGeometry(1.0, 0.85, 4.2, 16), HULL, s * 7.6, 1.6, -1.6);
    pod.rotation.x = Math.PI / 2;
    const ring = add(ship, new THREE.TorusGeometry(1.0, 0.16, 8, 20), TRIM, s * 7.6, 1.6, 0.4);
    ring.rotation.y = 0;
    // The left engine took the hit: its propeller is bent.
    propeller(ship, s * 7.6, 1.6, -3.9, s < 0 ? 0.6 : 0);
  }

  // Tail fins.
  const fin = add(ship, new THREE.BoxGeometry(0.35, 3.2, 3.4), TRIM, 0, 4.5, -9);
  fin.rotation.x = -0.35;
  for (const s of [-1, 1]) {
    const stab = add(ship, new THREE.BoxGeometry(4.2, 0.3, 2.4), HULL, s * 2.6, 2.6, -9.4);
    stab.rotation.z = s * 0.15;
  }

  const smoke = [new THREE.Vector3(-7.6, 2.4, -1.5), new THREE.Vector3(-1.5, 3, 6)];
  return { ship, smoke };
}

/** Roll's support car: a chunky little red off-roader. Local +Z is forward. */
export function buildSupportCar() {
  const car = new THREE.Group();
  add(car, new THREE.BoxGeometry(2.2, 0.8, 3.8), TRIM, 0, 0.95, 0);
  add(car, new THREE.BoxGeometry(2.25, 0.25, 3.85), 0xf2c230, 0, 0.62, 0);
  const cab = add(car, new THREE.BoxGeometry(2.0, 0.95, 1.8), 0xf4f4f4, 0, 1.8, -0.3);
  cab.rotation.x = 0.02;
  // Windscreen and side windows.
  const screen = add(car, new THREE.BoxGeometry(1.8, 0.6, 0.1), GLASS, 0, 1.9, 0.62);
  screen.rotation.x = -0.25;
  for (const s of [-1, 1]) add(car, new THREE.BoxGeometry(0.06, 0.5, 1.2), GLASS, s * 1.01, 1.9, -0.3);
  // Bull bar and headlights.
  add(car, new THREE.BoxGeometry(2.0, 0.35, 0.15), METAL, 0, 0.75, 1.95);
  for (const s of [-1, 1]) {
    const light = add(car, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), 0xfff6c0, s * 0.75, 1.15, 1.92);
    light.rotation.x = Math.PI / 2;
  }
  // Wheels.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = add(car, new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16), 0x2a2a30, sx * 1.1, 0.55, sz * 1.25);
      wheel.rotation.z = Math.PI / 2;
      const hub = add(car, new THREE.CylinderGeometry(0.25, 0.25, 0.47, 10), METAL, sx * 1.1, 0.55, sz * 1.25);
      hub.rotation.z = Math.PI / 2;
    }
  }
  // Roof rack with a toolbox.
  add(car, new THREE.BoxGeometry(1.7, 0.08, 1.4), METAL, 0, 2.32, -0.3);
  add(car, new THREE.BoxGeometry(0.9, 0.4, 0.6), 0x2f6fe0, -0.2, 2.56, -0.4);
  // Bed with a spare tyre.
  const spare = add(car, new THREE.TorusGeometry(0.4, 0.17, 8, 16), 0x2a2a30, 0, 1.55, -1.5);
  spare.rotation.x = Math.PI / 2;
  return car;
}
