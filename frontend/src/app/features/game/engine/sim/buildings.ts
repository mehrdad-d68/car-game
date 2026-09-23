import { Vec2 } from './types';

export type BuildingStyle = 'home' | 'apartment' | 'shop' | 'hut' | 'works';

export interface RawBuilding {
  id: number;
  type: string;
  name: string;
  levels?: number;
  height?: number;
  points: Vec2[];
}

export interface Building {
  id: number;
  type: string;
  style: BuildingStyle;
  floors: number;
  height: number;
  seed: number;
  points: Vec2[];
  centroid: Vec2;
  area: number;
}

export const FLOOR_HEIGHT = 3.2;
const MIN_AREA = 1;
const MAX_FLOORS = 60;

const STYLE_BY_TYPE: Record<string, BuildingStyle> = {
  house: 'home',
  detached: 'home',
  semidetached_house: 'home',
  terrace: 'home',
  bungalow: 'home',
  apartments: 'apartment',
  residential: 'apartment',
  dormitory: 'apartment',
  hotel: 'apartment',
  office: 'apartment',
  school: 'apartment',
  public: 'apartment',
  retail: 'shop',
  commercial: 'shop',
  kiosk: 'shop',
  supermarket: 'shop',
  garage: 'hut',
  garages: 'hut',
  shed: 'hut',
  hut: 'hut',
  carport: 'hut',
  roof: 'hut',
  industrial: 'works',
  warehouse: 'works',
  factory: 'works',
  service: 'works',
  church: 'works',
  train_station: 'works',
};

export function styleFor(type: string, floors: number): BuildingStyle {
  const known = STYLE_BY_TYPE[type.toLowerCase()];
  if (known) return known;
  return floors >= 3 ? 'apartment' : 'home';
}

const FLOORS_BY_STYLE: Record<BuildingStyle, number> = {
  home: 2,
  apartment: 4,
  shop: 2,
  hut: 1,
  works: 1,
};

function ladderFloors(area: number): number {
  if (area < 60) return 1;
  if (area < 150) return 2;
  if (area < 400) return 3;
  return 4;
}

function clampFloors(floors: number): number {
  return Math.min(Math.max(floors, 1), MAX_FLOORS);
}

export function floorsFor(
  type: string,
  area: number,
  levels?: number,
  height?: number,
): number {
  if (levels != null && levels >= 1 && levels <= MAX_FLOORS) {
    return Math.round(levels);
  }
  if (height != null && height >= 1 && isFinite(height)) {
    return clampFloors(Math.round(height / FLOOR_HEIGHT));
  }
  const known = STYLE_BY_TYPE[type.toLowerCase()];
  if (!known) return ladderFloors(area);
  const base = FLOORS_BY_STYLE[known];
  if (known === 'hut') return base;
  return Math.max(base, ladderFloors(area));
}

export function buildingSeed(id: number): number {
  let h = Math.abs(Math.trunc(id)) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function openRing(points: Vec2[]): Vec2[] {
  const ring = points.map((p) => ({ x: p.x, z: p.z }));
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first.x === last.x && first.z === last.z) ring.pop();
  return ring;
}

function signedArea(ring: Vec2[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    twice += p.x * q.z - q.x * p.z;
  }
  return twice / 2;
}

function centroidOf(ring: Vec2[], signed: number): Vec2 {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cross = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  return { x: cx / (6 * signed), z: cz / (6 * signed) };
}

export function createBuildings(raw: RawBuilding[]): Building[] {
  const built: Building[] = [];
  for (const item of raw) {
    if (!item.points || item.points.length < 4) continue;
    const ring = openRing(item.points);
    if (ring.length < 3) continue;
    const signed = signedArea(ring);
    const area = Math.abs(signed);
    if (area < MIN_AREA) continue;
    const centroid = centroidOf(ring, signed);
    if (signed < 0) ring.reverse();
    const floors = floorsFor(item.type, area, item.levels, item.height);
    const surveyedHeight =
      item.height != null && item.height >= 1 && isFinite(item.height) ? item.height : null;
    built.push({
      id: item.id,
      type: item.type.toLowerCase(),
      style: styleFor(item.type, floors),
      floors,
      height: surveyedHeight ?? floors * FLOOR_HEIGHT,
      seed: buildingSeed(item.id),
      points: ring,
      centroid,
      area,
    });
  }
  return built;
}

export const TILE_SIZE = 500;

export function tileKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class BuildingGrid {
  private readonly tiles = new Map<string, Building[]>();

  constructor(buildings: Building[]) {
    for (const building of buildings) {
      const key = tileKey(
        Math.floor(building.centroid.x / TILE_SIZE),
        Math.floor(building.centroid.z / TILE_SIZE),
      );
      const bucket = this.tiles.get(key);
      if (bucket) {
        bucket.push(building);
      } else {
        this.tiles.set(key, [building]);
      }
    }
  }

  tilesWithin(x: number, z: number, radius: number): string[] {
    const keys: string[] = [];
    const minCx = Math.floor((x - radius) / TILE_SIZE);
    const maxCx = Math.floor((x + radius) / TILE_SIZE);
    const minCz = Math.floor((z - radius) / TILE_SIZE);
    const maxCz = Math.floor((z + radius) / TILE_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = tileKey(cx, cz);
        if (this.tiles.has(key)) keys.push(key);
      }
    }
    return keys;
  }

  buildingsIn(key: string): Building[] {
    return this.tiles.get(key) ?? [];
  }

  near(x: number, z: number, radius: number): Building[] {
    const out: Building[] = [];
    const minCx = Math.floor((x - radius) / TILE_SIZE);
    const maxCx = Math.floor((x + radius) / TILE_SIZE);
    const minCz = Math.floor((z - radius) / TILE_SIZE);
    const maxCz = Math.floor((z + radius) / TILE_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.tiles.get(tileKey(cx, cz));
        if (!bucket) continue;
        for (const b of bucket) {
          if (Math.hypot(b.centroid.x - x, b.centroid.z - z) <= radius) out.push(b);
        }
      }
    }
    return out;
  }

  tileCentre(key: string): { x: number; z: number } {
    const [cx, cz] = key.split(',').map(Number);
    return { x: (cx + 0.5) * TILE_SIZE, z: (cz + 0.5) * TILE_SIZE };
  }
}
