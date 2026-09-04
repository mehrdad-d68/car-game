import { OSMMapData } from './osm-types';
import { Vec2 } from './types';

export interface PolylineRoad {
  name: string;
  width: number;
  oneway: 0 | 1 | -1;
  access: string;
  points: Vec2[];
}

export interface TrackBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Spawn {
  position: Vec2;
  heading: number;
}

export interface TrackData {
  roads: PolylineRoad[];
  bounds: TrackBounds;
  spawn: Spawn;
}

const WIDTH_BUCKETS = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const MAJOR_ROAD_MIN_WIDTH = 12;

function quantizeWidth(raw: number): number {
  let best = WIDTH_BUCKETS[0];
  let bestDist = Math.abs(raw - best);
  for (let i = 1; i < WIDTH_BUCKETS.length; i++) {
    const dist = Math.abs(raw - WIDTH_BUCKETS[i]);
    if (dist < bestDist) {
      best = WIDTH_BUCKETS[i];
      bestDist = dist;
    }
  }
  return best;
}

const ORIGIN_SPAWN: Spawn = { position: { x: 0, z: 0 }, heading: 0 };

function selectSpawn(roads: { width: number; points: Vec2[] }[]): Spawn {
  if (roads.length === 0) {
    return ORIGIN_SPAWN;
  }

  const major = roads.filter((r) => r.width >= MAJOR_ROAD_MIN_WIDTH);
  const candidates = major.length > 0 ? major : roads;

  let best: Spawn | null = null;
  let bestDistSq = Infinity;

  for (const road of candidates) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const p = road.points[i];
      const d = p.x * p.x + p.z * p.z;
      if (d < bestDistSq) {
        bestDistSq = d;
        const dx = road.points[i + 1].x - p.x;
        const dz = road.points[i + 1].z - p.z;
        best = { position: { x: p.x, z: p.z }, heading: Math.atan2(-dx, -dz) };
      }
    }
  }

  return best ?? ORIGIN_SPAWN;
}

export function createTrack(osmData: OSMMapData): TrackData {
  const roads: PolylineRoad[] = [];

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (const road of osmData.roads) {
    if (road.points.length < 2) {
      continue;
    }

    const points: Vec2[] = road.points.map((p) => ({ x: p.x, z: p.z }));
    const width = quantizeWidth(road.width);

    roads.push({ name: road.name ?? '', width, oneway: road.oneway, access: road.access, points });

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  }

  const padding = 50;

  return {
    roads,
    bounds: {
      minX: minX - padding,
      minZ: minZ - padding,
      maxX: maxX + padding,
      maxZ: maxZ + padding,
    },
    spawn: selectSpawn(roads),
  };
}
