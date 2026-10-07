import * as THREE from 'three';

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  /** Downward speed at the moment of landing (0 if no landing). */
  landingSpeed: number;
}

const STEP_HEIGHT = 0.3;
const SNAP_DOWN = 0.25;

/**
 * Static collision for the level: a ground height function plus axis-aligned
 * boxes. Dynamic bodies are vertical cylinders whose position is their feet.
 */
export class CollisionWorld {
  boxes: Box[] = [];

  groundHeight: (x: number, z: number) => number = () => 0;

  addBox(center: THREE.Vector3, size: THREE.Vector3): Box {
    const half = size.clone().multiplyScalar(0.5);
    const box = { min: center.clone().sub(half), max: center.clone().add(half) };
    this.boxes.push(box);
    return box;
  }

  /** Highest walkable surface under a circle, at or below `maxY`. */
  floorAt(x: number, z: number, radius: number, maxY: number) {
    let floor = this.groundHeight(x, z);
    for (const b of this.boxes) {
      if (b.max.y > maxY || b.max.y <= floor) continue;
      if (circleRectDistSq(x, z, b) < radius * radius) floor = b.max.y;
    }
    return floor;
  }

  moveCylinder(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    radius: number,
    height: number,
    dt: number,
    wasGrounded: boolean,
  ): MoveResult {
    const result: MoveResult = { grounded: false, hitWall: false, hitCeiling: false, landingSpeed: 0 };

    // Horizontal pass: push out of boxes that overlap our body vertically.
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.max.y <= pos.y + STEP_HEIGHT || b.min.y >= pos.y + height) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x);
        const cz = clamp(pos.z, b.min.z, b.max.z);
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;
        let nx: number, nz: number, push: number;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          nx = dx / dist;
          nz = dz / dist;
          push = radius - dist;
        } else {
          // Centre is inside the box: leave by the shallowest side.
          const exits = [
            [pos.x - b.min.x, -1, 0],
            [b.max.x - pos.x, 1, 0],
            [pos.z - b.min.z, 0, -1],
            [b.max.z - pos.z, 0, 1],
          ].sort((a, c) => a[0] - c[0])[0];
          nx = exits[1];
          nz = exits[2];
          push = exits[0] + radius;
        }
        pos.x += nx * push;
        pos.z += nz * push;
        const into = vel.x * nx + vel.z * nz;
        if (into < 0) {
          vel.x -= into * nx;
          vel.z -= into * nz;
        }
        result.hitWall = true;
      }
    }

    // Vertical pass.
    const prevY = pos.y;
    pos.y += vel.y * dt;

    if (vel.y > 0) {
      for (const b of this.boxes) {
        if (b.min.y < prevY + height - 1e-3 || b.min.y > pos.y + height) continue;
        if (circleRectDistSq(pos.x, pos.z, b) >= radius * radius) continue;
        pos.y = b.min.y - height;
        vel.y = 0;
        result.hitCeiling = true;
      }
    }

    const floor = this.floorAt(pos.x, pos.z, radius * 0.8, Math.max(prevY, pos.y) + STEP_HEIGHT);
    if (pos.y <= floor || (wasGrounded && vel.y <= 0 && pos.y - floor < SNAP_DOWN)) {
      if (!wasGrounded && vel.y < 0) result.landingSpeed = -vel.y;
      pos.y = floor;
      if (vel.y < 0) vel.y = 0;
      result.grounded = true;
    }
    return result;
  }

  /** Does a sphere overlap any box or the ground? */
  sphereHits(p: THREE.Vector3, r: number) {
    if (p.y - r < this.groundHeight(p.x, p.z)) return true;
    for (const b of this.boxes) {
      const cx = clamp(p.x, b.min.x, b.max.x);
      const cy = clamp(p.y, b.min.y, b.max.y);
      const cz = clamp(p.z, b.min.z, b.max.z);
      if ((p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Distance along a ray to the first box hit, or `maxDist`. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    let best = maxDist;
    for (const b of this.boxes) {
      let tmin = 0;
      let tmax = best;
      let miss = false;
      for (const axis of ['x', 'y', 'z'] as const) {
        const o = origin[axis];
        const d = dir[axis];
        if (Math.abs(d) < 1e-8) {
          if (o < b.min[axis] || o > b.max[axis]) miss = true;
          continue;
        }
        let t1 = (b.min[axis] - o) / d;
        let t2 = (b.max[axis] - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) miss = true;
      }
      if (!miss && tmin < best) best = tmin;
    }
    return best;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function circleRectDistSq(x: number, z: number, b: Box) {
  const dx = x - clamp(x, b.min.x, b.max.x);
  const dz = z - clamp(z, b.min.z, b.max.z);
  return dx * dx + dz * dz;
}
