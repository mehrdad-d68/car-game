import { Building, FLOOR_HEIGHT } from '../sim/buildings';
import { Vec2 } from '../sim/types';

export type PartKind =
  | 'gableRoof'
  | 'flatRoof'
  | 'parapet'
  | 'sawtooth'
  | 'chimney'
  | 'tank'
  | 'aerial'
  | 'acBox'
  | 'awning'
  | 'sign'
  | 'window'
  | 'door';

export const PART_KINDS: readonly PartKind[] = [
  'gableRoof',
  'flatRoof',
  'parapet',
  'sawtooth',
  'chimney',
  'tank',
  'aerial',
  'acBox',
  'awning',
  'sign',
  'window',
  'door',
];

export interface PartPlacement {
  kind: PartKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARAPET_HEIGHT = 0.8;
const PARAPET_THICKNESS = 0.3;

export const WINDOW_WIDTH = 1.4;
export const WINDOW_HEIGHT = 1.8;
export const WINDOW_SPACING = 3.2;
export const WINDOW_INSET = 0.9;
export const WINDOW_SILL = 1.0;
export const DOOR_HEIGHT = 2.2;
export const DOOR_WIDTH = 1.1;
export const DOOR_CLEAR = 0.5;

const MIN_ROOF_FILL = 0.85;
const ROOF_CORNER_SLACK = 1;

function longestEdgeIndex(ring: Vec2[]): number {
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

function insideRing(x: number, z: number, ring: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

function nearRing(x: number, z: number, ring: Vec2[], slack: number): boolean {
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
interface RoofFrame {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  yaw: number;
  along: number;
  across: number;
  fits: boolean;
}

function roofFrame(building: Building): RoofFrame {
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

function frameX(f: RoofFrame, s: number, t: number): number {
  return f.cx + f.ux * s - f.uz * t;
}

function frameZ(f: RoofFrame, s: number, t: number): number {
  return f.cz + f.uz * s + f.ux * t;
}

function placeFacade(building: Building): PartPlacement[] {
  const out: PartPlacement[] = [];
  const ring = building.points;
  if (ring.length < 3) return out;

  const longestIndex = longestEdgeIndex(ring);

  const withWindows = building.style !== 'hut';
  const doorWidth = building.style === 'hut' || building.style === 'works' ? 2.4 : DOOR_WIDTH;
  const firstFloor =
    building.style === 'shop' ? 1 : 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uz = dz / len;
    const yaw = Math.atan2(dx, dz);

    if (withWindows) {
      const available = len - 2 * WINDOW_INSET;
      if (available >= WINDOW_WIDTH) {
        const perEdge = Math.floor(available / WINDOW_SPACING) + 1;
        const slot = available / perEdge;
        for (let floor = firstFloor; floor < building.floors; floor++) {
          const y = floor * FLOOR_HEIGHT + WINDOW_SILL + WINDOW_HEIGHT / 2;
          for (let k = 0; k < perEdge; k++) {
            const t = WINDOW_INSET + k * slot;
            if (i === longestIndex && Math.abs(t - len / 2) < doorWidth / 2 + DOOR_CLEAR) {
              continue;
            }
            out.push({
              kind: 'window',
              x: a.x + ux * t + uz * 0.03,
              y,
              z: a.z + uz * t - ux * 0.03,
              yaw,
              sx: 0.1,
              sy: WINDOW_HEIGHT,
              sz: WINDOW_WIDTH,
            });
          }
        }
      }
    }

    if (i === longestIndex) {
      out.push({
        kind: 'door',
        x: a.x + ux * (len / 2),
        y: DOOR_HEIGHT / 2,
        z: a.z + uz * (len / 2),
        yaw,
        sx: 0.12,
        sy: DOOR_HEIGHT,
        sz: doorWidth,
      });
    }
  }
  return out;
}

export function planParts(building: Building): PartPlacement[] {
  const r = rng(building.seed);
  const ring = building.points;
  const f = roofFrame(building);
  const parts: PartPlacement[] = [];

  switch (building.style) {
    case 'home': {
      if (f.fits) {
        parts.push({
          kind: 'gableRoof',
          x: f.cx,
          y: building.height,
          z: f.cz,
          yaw: f.yaw,
          sx: f.across,
          sy: 2 + r() * 1.5,
          sz: f.along,
        });
      }
      if (r() < 0.6) {
        const x = frameX(f, -0.2 * f.along, 0);
        const z = frameZ(f, -0.2 * f.along, 0);
        if (insideRing(x, z, ring)) {
          parts.push({ kind: 'chimney', x, y: building.height + 0.5, z, yaw: f.yaw, sx: 0.6, sy: 1.2, sz: 0.6 });
        }
      }
      break;
    }
    case 'apartment': {
      const t = PARAPET_THICKNESS;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-6) continue;
        const ux = (b.x - a.x) / len;
        const uz = (b.z - a.z) / len;
        parts.push({
          kind: 'parapet',
          x: (a.x + b.x) / 2 - uz * (t / 2),
          y: building.height,
          z: (a.z + b.z) / 2 + ux * (t / 2),
          yaw: Math.atan2(ux, uz),
          sx: t,
          sy: PARAPET_HEIGHT,
          sz: len,
        });
      }
      const kinds: PartKind[] = ['tank', 'aerial', 'acBox'];
      const count = 1 + Math.floor(r() * 3);
      for (let i = 0; i < count; i++) {
        const kind = kinds[Math.floor(r() * kinds.length)];
        const s = (r() - 0.5) * Math.max(f.along - 2, 0);
        const across = (r() - 0.5) * Math.max(f.across - 2, 0);
        const yaw = r() * Math.PI;
        const x = frameX(f, s, across);
        const z = frameZ(f, s, across);
        if (!insideRing(x, z, ring)) continue;
        parts.push({
          kind,
          x,
          y: building.height,
          z,
          yaw,
          sx: kind === 'tank' ? 1.8 : kind === 'aerial' ? 0.15 : 0.8,
          sy: kind === 'tank' ? 1.4 : kind === 'aerial' ? 1.2 : 0.5,
          sz: kind === 'tank' ? 1.8 : kind === 'aerial' ? 0.15 : 0.6,
        });
      }
      break;
    }
    case 'shop': {
      if (f.fits) {
        parts.push({ kind: 'flatRoof', x: f.cx, y: building.height, z: f.cz, yaw: f.yaw, sx: f.across, sy: 0.2, sz: f.along });
      }
      const i = longestEdgeIndex(ring);
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const yaw = Math.atan2(ux, uz);
      parts.push({
        kind: 'awning',
        x: (a.x + b.x) / 2 + uz * 0.6,
        y: 3,
        z: (a.z + b.z) / 2 - ux * 0.6,
        yaw,
        sx: 1.2,
        sy: 0.25,
        sz: len,
      });
      parts.push({
        kind: 'sign',
        x: a.x + ux * 0.5 + uz * 0.05,
        y: 3.6,
        z: a.z + uz * 0.5 - ux * 0.05,
        yaw,
        sx: 0.1,
        sy: 0.6,
        sz: 0.8,
      });
      break;
    }
    case 'hut': {
      if (f.fits) {
        parts.push({ kind: 'flatRoof', x: f.cx, y: building.height, z: f.cz, yaw: f.yaw, sx: f.across, sy: 0.2, sz: f.along });
      }
      break;
    }
    case 'works': {
      if (!f.fits) break;
      const count = Math.max(1, Math.round(f.along / 8));
      const seg = f.along / count;
      for (let i = 0; i < count; i++) {
        const s = -f.along / 2 + seg * (i + 0.5);
        parts.push({
          kind: 'sawtooth',
          x: frameX(f, s, 0),
          y: building.height,
          z: frameZ(f, s, 0),
          yaw: f.yaw,
          sx: f.across,
          sy: 1.5,
          sz: seg,
        });
      }
      break;
    }
  }

  parts.push(...placeFacade(building));
  return parts;
}
