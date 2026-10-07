import * as THREE from 'three';
import type { CollisionWorld } from '../engine/collision';
import type { InputState } from '../engine/input';
import { wrapAngle } from './player';
import type { Target } from './types';

const DISTANCE = 5.2;
const MIN_PITCH = -0.35;
const MAX_PITCH = 1.2;
const PIVOT_HEIGHT = 1.45;

/** Third-person orbit camera with a lock-on framing mode. */
export class CameraRig {
  yaw = 0;
  pitch = 0.25;
  private distance = DISTANCE;
  private readonly pivot = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  /** Big moving things (the boss) the camera should not sit inside. */
  obstacles: { center: THREE.Vector3; radius: number; active?: boolean }[] = [];

  constructor(readonly camera: THREE.PerspectiveCamera, private world: CollisionWorld) {}

  /** Jump straight to the player next update instead of gliding (teleports). */
  cut() {
    this.pivot.set(0, 0, 0);
  }

  update(dt: number, input: InputState, playerPos: THREE.Vector3, lock: Target | null) {
    if (lock) {
      // Swing behind the player so both they and the target stay framed.
      const desiredYaw = Math.atan2(lock.center.x - playerPos.x, lock.center.z - playerPos.z);
      this.yaw += wrapAngle(desiredYaw - this.yaw) * Math.min(1, dt * 6);
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.3, Math.min(1, dt * 4));
    } else {
      this.yaw -= input.lookX;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY, MIN_PITCH, MAX_PITCH);
    }

    const target = new THREE.Vector3(playerPos.x, playerPos.y + PIVOT_HEIGHT, playerPos.z);
    this.pivot.lerp(target, this.pivot.lengthSq() === 0 ? 1 : Math.min(1, dt * 14));

    const cp = Math.cos(this.pitch);
    const back = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);

    // Pull in when a wall is between the camera and Mega Man.
    let hit = this.world.raycast(this.pivot, back, DISTANCE);
    for (const o of this.obstacles) {
      if (o.active === false) continue;
      // Ray-sphere entry distance.
      const oc = this.pivot.clone().sub(o.center);
      const b = oc.dot(back);
      const c = oc.lengthSq() - o.radius * o.radius;
      const disc = b * b - c;
      if (disc < 0 || c < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < hit) hit = t;
    }
    const wanted = Math.max(0.8, hit - 0.3);
    this.distance = wanted < this.distance ? wanted : THREE.MathUtils.lerp(this.distance, wanted, Math.min(1, dt * 4));

    const pos = this.pivot.clone().addScaledVector(back, this.distance);
    const floor = this.world.groundHeight(pos.x, pos.z) + 0.3;
    if (pos.y < floor) pos.y = floor;
    this.camera.position.copy(pos);

    if (lock) {
      const mid = this.pivot.clone().lerp(lock.center, 0.35);
      this.camera.lookAt(mid);
    } else {
      this.camera.lookAt(this.pivot);
    }
    this.camera.getWorldDirection(this.forward);
  }

  /** World point under the crosshair (screen centre). */
  aimPoint(maxDist = 60) {
    const origin = this.camera.position;
    const d = this.world.raycast(origin, this.forward, maxDist);
    return origin.clone().addScaledVector(this.forward, d);
  }
}
