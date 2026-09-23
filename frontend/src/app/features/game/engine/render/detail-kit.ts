import { Building, FLOOR_HEIGHT } from '../sim/buildings';
import { Vec2 } from '../sim/types';
import {
  frameX,
  frameZ,
  insideRing,
  longestEdgeIndex,
  roofFrame,
} from '../sim/footprint';

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
  | 'balcony'
  | 'balustrade'
  | 'balconyDoor'
  | 'dormer';

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
  'balcony',
  'balustrade',
  'balconyDoor',
  'dormer',
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

const BALCONY_INSET = 1.2;
const BALCONY_WIDTH = 2.4;
const BALCONY_DEPTH = 1.5;
const BALCONY_EMBED = 0.05;
const BALCONY_SLAB_THICKNESS = 0.14;
const BALCONY_SILL = 0.2;
const GUARD_HEIGHT = 1.0;
const GUARD_THICKNESS = 0.08;
const DOOR_WIDTH = 0.9;
const DOOR_HEIGHT = 2.2;
const DOOR_THICKNESS = 0.1;
const DOOR_OFFSET = 0.02;

function balconyObscured(
  building: Building,
  a: Vec2,
  ux: number,
  uz: number,
  t: number,
  slabY: number,
  nearby: Building[],
): boolean {
  const slabMinDepth = -BALCONY_EMBED;
  const slabMaxDepth = BALCONY_DEPTH - BALCONY_EMBED;
  const corners: Vec2[] = [];
  for (const sign of [-1, 1]) {
    for (const depth of [slabMinDepth, slabMaxDepth]) {
      const along = t + sign * (BALCONY_WIDTH / 2) - 0.05;
      corners.push({
        x: a.x + ux * along + uz * depth,
        z: a.z + uz * along - ux * depth,
      });
    }
  }
  for (const nb of nearby) {
    if (nb.id === building.id) continue;
    if (nb.height < slabY - 0.1) continue;
    if (corners.some((p) => insideRing(p.x, p.z, nb.points))) return true;
  }
  return false;
}

function placeBalconies(
  building: Building,
  r: () => number,
  nearby: Building[] = [],
): PartPlacement[] {
  const out: PartPlacement[] = [];
  if (building.style !== 'home' && building.style !== 'apartment') return out;
  const ring = building.points;
  const floors = building.style === 'apartment' ? Math.min(building.floors, 5) : building.floors;
  if (floors < 2) return out;

  const i = longestEdgeIndex(ring);
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return out;
  const ux = dx / len;
  const uz = dz / len;
  const yaw = Math.atan2(dx, dz);

  const perEdge = Math.min(3, Math.max(1, Math.floor(len / 6)));
  const chunk = (len - 2 * BALCONY_INSET) / perEdge;
  const slabOffset = BALCONY_DEPTH / 2 - BALCONY_EMBED;
  const guardOffset = BALCONY_DEPTH - BALCONY_EMBED - GUARD_THICKNESS / 2;
  for (let k = 0; k < perEdge; k++) {
    const t = BALCONY_INSET + chunk * (k + 0.5);
    const floor = 1 + Math.floor(r() * (floors - 1));
    const slabY = floor * FLOOR_HEIGHT + BALCONY_SILL;
    if (balconyObscured(building, a, ux, uz, t, slabY, nearby)) continue;
    const slabTop = slabY + BALCONY_SLAB_THICKNESS / 2;
    out.push({
      kind: 'balcony',
      x: a.x + ux * t + uz * slabOffset,
      y: slabY,
      z: a.z + uz * t - ux * slabOffset,
      yaw,
      sx: BALCONY_DEPTH,
      sy: BALCONY_SLAB_THICKNESS,
      sz: BALCONY_WIDTH,
    });
    out.push({
      kind: 'balustrade',
      x: a.x + ux * t + uz * guardOffset,
      y: slabTop + GUARD_HEIGHT / 2,
      z: a.z + uz * t - ux * guardOffset,
      yaw,
      sx: GUARD_THICKNESS,
      sy: GUARD_HEIGHT,
      sz: BALCONY_WIDTH - 0.2,
    });
    const sideYaw = yaw + Math.PI / 2;
    for (const side of [-1, 1]) {
      const tSide = t + (side * (BALCONY_WIDTH / 2 - GUARD_THICKNESS / 2 - 0.02));
      out.push({
        kind: 'balustrade',
        x: a.x + ux * tSide + uz * slabOffset,
        y: slabTop + GUARD_HEIGHT / 2,
        z: a.z + uz * tSide - ux * slabOffset,
        yaw: sideYaw,
        sx: GUARD_THICKNESS,
        sy: GUARD_HEIGHT,
        sz: BALCONY_DEPTH - BALCONY_EMBED,
      });
    }
    out.push({
      kind: 'balconyDoor',
      x: a.x + ux * t + uz * DOOR_OFFSET,
      y: floor * FLOOR_HEIGHT + 0.2 + DOOR_HEIGHT / 2,
      z: a.z + uz * t - ux * DOOR_OFFSET,
      yaw,
      sx: DOOR_THICKNESS,
      sy: DOOR_HEIGHT,
      sz: DOOR_WIDTH,
    });
  }
  return out;
}

const DORMER_WIDTH = 1.8;
const DORMER_EMBED = 0.15;

function placeDormers(
  building: Building,
  r: () => number,
  gableSy: number,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const f = roofFrame(building);
  if (building.style !== 'home' || !f.fits) return out;
  const count = 1 + (r() < 0.5 ? 1 : 0);
  const span = Math.max(f.along - DORMER_WIDTH, 0);
  const chunk = span / count;
  const roofTop = building.height + gableSy / 2;
  const tBase = Math.max(f.across / 2 - DORMER_WIDTH / 2 - 0.6, 0);
  for (let k = 0; k < count; k++) {
    const s = -span / 2 + chunk * (k + 0.5);
    const t = (k % 2 === 0 ? 1 : -1) * tBase;
    out.push({
      kind: 'dormer',
      x: frameX(f, s, t),
      y: roofTop - DORMER_EMBED + 1.4 / 2,
      z: frameZ(f, s, t),
      yaw: f.yaw,
      sx: 1.0,
      sy: 1.4,
      sz: DORMER_WIDTH,
    });
  }
  return out;
}

export function planParts(building: Building, nearby: Building[] = []): PartPlacement[] {
  const r = rng(building.seed);
  const ring = building.points;
  const f = roofFrame(building);
  const parts: PartPlacement[] = [];

  switch (building.style) {
    case 'home': {
      let gableSy = 0;
      if (f.fits) {
        gableSy = 2 + r() * 1.5;
        parts.push({
          kind: 'gableRoof',
          x: f.cx,
          y: building.height,
          z: f.cz,
          yaw: f.yaw,
          sx: f.across,
          sy: gableSy,
          sz: f.along,
        });
      }
      parts.push(...placeDormers(building, r, gableSy));
      if (r() < 0.6) {
        const x = frameX(f, -0.2 * f.along, 0);
        const z = frameZ(f, -0.2 * f.along, 0);
        if (insideRing(x, z, ring)) {
          parts.push({ kind: 'chimney', x, y: building.height + 0.5, z, yaw: f.yaw, sx: 0.6, sy: 1.2, sz: 0.6 });
        }
      }
      parts.push(...placeBalconies(building, r, nearby));
      break;
    }
    case 'apartment': {
      parts.push(...placeBalconies(building, r, nearby));
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

  return parts;
}
