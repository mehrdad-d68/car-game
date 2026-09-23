import { Building } from './buildings';
import { Vec2 } from './types';

export const MIN_ROOF_FILL = 0.85;
export const ROOF_CORNER_SLACK = 1;

export function longestEdgeIndex(ring: Vec2[]): number {
  let index = 0;
  let longest = -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > longest) {
      longest = len;
      index = i;
    }
  }
  return index;
}

export function insideRing(x: number, z: number, ring: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

export function nearRing(x: number, z: number, ring: Vec2[], slack: number): boolean {
  if (insideRing(x, z, ring)) return true;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) <= slack) return true;
  }
  return false;
}

// A rectangle aligned with the longest wall. A box part with this yaw has its local Z along
// that wall, so `along` goes in sz and `across` in sx.
export interface RoofFrame {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  yaw: number;
  along: number;
  across: number;
  fits: boolean;
}

export function roofFrame(building: Building): RoofFrame {
  const ring = building.points;
  const i = longestEdgeIndex(ring);
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / len;
  const uz = (b.z - a.z) / len;
  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const p of ring) {
    const s = p.x * ux + p.z * uz;
    const t = -p.x * uz + p.z * ux;
    minS = Math.min(minS, s);
    maxS = Math.max(maxS, s);
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  const s0 = (minS + maxS) / 2;
  const t0 = (minT + maxT) / 2;
  const along = maxS - minS;
  const across = maxT - minT;
  const frame: RoofFrame = {
    cx: s0 * ux - t0 * uz,
    cz: s0 * uz + t0 * ux,
    ux,
    uz,
    yaw: Math.atan2(ux, uz),
    along,
    across,
    fits: false,
  };
  const hs = along / 2;
  const ht = across / 2;
  frame.fits =
    building.area / (along * across) >= MIN_ROOF_FILL &&
    [[-hs, -ht], [hs, -ht], [hs, ht], [-hs, ht]].every(([s, t]) =>
      nearRing(frameX(frame, s, t), frameZ(frame, s, t), ring, ROOF_CORNER_SLACK),
    );
  return frame;
}

export function frameX(f: RoofFrame, s: number, t: number): number {
  return f.cx + f.ux * s - f.uz * t;
}

export function frameZ(f: RoofFrame, s: number, t: number): number {
  return f.cz + f.uz * s + f.ux * t;
}