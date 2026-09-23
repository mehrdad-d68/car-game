import { Building, TILE_SIZE } from './buildings';
import { BuildingAssignment, BuildingAssignments, BuildingPlacement, BuildingSpec } from './building-spec';
import { roofFrame } from './footprint';
import { Vec2 } from './types';

const MIN_SCALE = 0.85;
const MAX_SCALE = 1.15;
const CLAIM_INSET = 2;

export const CATALOG_MAX_SCALE = MAX_SCALE;
export const CATALOG_MIN_SCALE = MIN_SCALE;

export interface CatalogFit {
  x: number;
  z: number;
  yaw: number;
  scale: Vec2;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function within(actual: number, target: number, tolerance: number): boolean {
  return Math.abs(actual - target) <= tolerance;
}

function footprintDimsWithin(
  across: number,
  along: number,
  spec: BuildingSpec,
): boolean {
  const { width, depth, tolerance } = spec.footprint;
  return (
    (within(across, width, tolerance) && within(along, depth, tolerance)) ||
    (within(across, depth, tolerance) && within(along, width, tolerance))
  );
}

function genericType(type: string): boolean {
  return type === '' || type === 'building' || type === 'yes';
}

function ruleMatch(building: Building, spec: BuildingSpec): boolean {
  const match = spec.match;
  if (!match) return false;
  const type = building.type.toLowerCase();
  if (match.osmTypes && !genericType(type) && !match.osmTypes.includes(type)) {
    return false;
  }
  if (match.minArea != null && building.area < match.minArea) return false;
  if (match.maxArea != null && building.area > match.maxArea) return false;
  if (match.minFloors != null && building.floors < match.minFloors) return false;
  if (match.maxFloors != null && building.floors > match.maxFloors) return false;
  return true;
}

export function chooseSpec(
  building: Building,
  specs: BuildingSpec[],
): BuildingSpec | null {
  const candidates = specs.filter((spec) => {
    if (!ruleMatch(building, spec)) return false;
    const frame = roofFrame(building);
    return frame.fits && footprintDimsWithin(frame.across, frame.along, spec);
  });
  if (candidates.length === 0) return null;
  const total = candidates.reduce(
    (sum, spec) => sum + (spec.match?.weight ?? 1),
    0,
  );
  const r = seeded(building.seed);
  let pick = r() * total;
  for (const spec of candidates) {
    pick -= spec.match?.weight ?? 1;
    if (pick < 0) return spec;
  }
  return candidates[candidates.length - 1];
}

export function fitSpec(
  building: Building,
  spec: BuildingSpec,
): CatalogFit | null {
  const frame = roofFrame(building);
  if (!frame.fits) return null;
  const { width, depth } = spec.footprint;
  const candidates = [
    { sx: frame.across / width, sz: frame.along / depth, yaw: frame.yaw },
    { sx: frame.along / width, sz: frame.across / depth, yaw: frame.yaw + Math.PI / 2 },
  ];
  let best: { sx: number; sz: number; yaw: number; distortion: number } | null = null;
  for (const candidate of candidates) {
    if (
      candidate.sx < MIN_SCALE ||
      candidate.sx > MAX_SCALE ||
      candidate.sz < MIN_SCALE ||
      candidate.sz > MAX_SCALE
    ) {
      continue;
    }
    const distortion = Math.max(
      Math.abs(candidate.sx - 1),
      Math.abs(candidate.sz - 1),
    );
    if (!best || distortion < best.distortion) {
      best = { ...candidate, distortion };
    }
  }
  if (!best) return null;
  return {
    x: frame.cx,
    z: frame.cz,
    yaw: best.yaw,
    scale: { x: best.sx, z: best.sz },
  };
}

export function placeSpec(building: Building, spec: BuildingSpec): CatalogFit {
  const fitted = fitSpec(building, spec);
  if (fitted) return fitted;
  const frame = roofFrame(building);
  return {
    x: frame.cx,
    z: frame.cz,
    yaw: frame.across >= frame.along ? frame.yaw : frame.yaw + Math.PI / 2,
    scale: { x: 1, z: 1 },
  };
}

export interface CatalogMatch {
  spec: BuildingSpec;
  fit: CatalogFit;
}

export function resolveOne(
  building: Building,
  entry: BuildingAssignment | undefined,
  specsById: Map<string, BuildingSpec>,
  warned: Set<string> = new Set(),
): CatalogMatch | null {
  if (!entry || entry.spec === null) return null;
  const spec = specsById.get(entry.spec);
  if (!spec) {
    if (!warned.has(entry.spec)) {
      warned.add(entry.spec);
      console.warn(
        `Building assignment references unknown design "${entry.spec}" for building #${building.id}; ignoring it`,
      );
    }
    return null;
  }
  const placed = placeSpec(building, spec);
  return {
    spec,
    fit: {
      x: placed.x,
      z: placed.z,
      yaw: entry.yaw ?? placed.yaw,
      scale: entry.scale
        ? { x: entry.scale[0], z: entry.scale[1] }
        : placed.scale,
    },
  };
}

export function resolveAssignments(
  buildings: Building[],
  assignments: BuildingAssignments,
  specs: BuildingSpec[],
): Map<number, CatalogMatch> {
  const specsById = new Map(specs.map((spec) => [spec.id, spec]));
  const resolved = new Map<number, CatalogMatch>();
  const warned = new Set<string>();
  for (const building of buildings) {
    const match = resolveOne(building, assignments[String(building.id)], specsById, warned);
    if (match) resolved.set(building.id, match);
  }
  return resolved;
}

export function tileKeyOf(x: number, z: number): string {
  return `${Math.floor(x / TILE_SIZE)},${Math.floor(z / TILE_SIZE)}`;
}

export function placementIndex(
  placements: BuildingPlacement[],
): Map<string, BuildingPlacement[]> {
  const index = new Map<string, BuildingPlacement[]>();
  for (const placement of placements) {
    const key = tileKeyOf(placement.x, placement.z);
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(placement);
    } else {
      index.set(key, [placement]);
    }
  }
  return index;
}

export function placementClaims(
  buildings: Building[],
  placements: BuildingPlacement[],
  specsById: Map<string, BuildingSpec>,
): Set<number> {
  const claims = new Set<number>();
  for (const placement of placements) {
    const spec = specsById.get(placement.specId);
    const reach = spec
      ? Math.max(spec.footprint.width, spec.footprint.depth) / 2 + CLAIM_INSET
      : 6;
    for (const building of buildings) {
      if (
        Math.hypot(
          building.centroid.x - placement.x,
          building.centroid.z - placement.z,
        ) <= reach
      ) {
        claims.add(building.id);
      }
    }
  }
  return claims;
}