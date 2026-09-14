import { MapItem, OSMMapData, StationItem } from './osm-types';
import { Building, createBuildings } from './buildings';
import { Vec2 } from './types';

export type RoadClass = 'major' | 'street' | 'service' | 'shared';

export interface PolylineRoad {
  name: string;
  type: string;
  lanes: number;
  width: number;
  oneway: 0 | 1 | -1;
  access: string;
  points: Vec2[];
}

export function roadClass(type: string): RoadClass {
  const t = type.toLowerCase();
  if (
    t === 'motorway' ||
    t === 'primary' ||
    t === 'secondary' ||
    t === 'tertiary' ||
    t.endsWith('_link')
  ) {
    return 'major';
  }
  if (t === 'service') return 'service';
  if (t === 'living_street') return 'shared';
  return 'street';
}

export type MarkingPattern = 'none' | 'two-way-dashed' | 'two-way-double' | 'one-way';

export function markingPattern(road: PolylineRoad): MarkingPattern {
  const cls = roadClass(road.type);
  if (cls === 'service' || cls === 'shared') return 'none';
  const lanes = Math.max(road.lanes, 1);
  if (road.oneway !== 0) return 'one-way';
  if (cls === 'major' && lanes >= 4) return 'two-way-double';
  return 'two-way-dashed';
}

export function projectOntoRoad(
  points: Vec2[],
  position: Vec2,
): { along: number; lateral: number } {
  let running = 0;
  let bestAlong = 0;
  let bestLateral = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);

    let t = 0;
    if (segLen > 1e-9) {
      t =
        ((position.x - a.x) * dx + (position.z - a.z) * dz) /
        (segLen * segLen);
      t = Math.max(0, Math.min(1, t));
    }

    const projX = a.x + dx * t;
    const projZ = a.z + dz * t;
    const lateral = Math.hypot(position.x - projX, position.z - projZ);
    if (lateral < bestLateral) {
      bestLateral = lateral;
      bestAlong = running + segLen * t;
    }
    running += segLen;
  }

  return { along: bestAlong, lateral: bestLateral };
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

export interface TrafficLightMarker {
  id: number;
  position: Vec2;
}

export interface PedestrianCrossingMarker {
  id: number;
  position: Vec2;
}

export interface PublicTransportStopMarker {
  id: number;
  name: string;
  type: string;
  position: Vec2;
  width?: number;
  depth?: number;
  area?: number;
}

export interface PoiMarker {
  id: number;
  name: string;
  position: Vec2;
  width?: number;
  depth?: number;
  area?: number;
}

export interface MapFeatures {
  trafficLights: TrafficLightMarker[];
  pedestrianCrossings: PedestrianCrossingMarker[];
  publicTransportStops: PublicTransportStopMarker[];
  gasStations: PoiMarker[];
  fireStations: PoiMarker[];
  hospitals: PoiMarker[];
  policeStations: PoiMarker[];
}

export interface TrackData {
  roads: PolylineRoad[];
  bounds: TrackBounds;
  spawn: Spawn;
  features: MapFeatures;
  buildings: Building[];
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

const STOP_MERGE_RADIUS = 30;

function withinMergeRadius(
  stop: PublicTransportStopMarker,
  others: PublicTransportStopMarker[],
): boolean {
  return others.some(
    (other) =>
      Math.hypot(
        other.position.x - stop.position.x,
        other.position.z - stop.position.z,
      ) <= STOP_MERGE_RADIUS,
  );
}

export function dedupePublicTransportStops(
  stops: PublicTransportStopMarker[],
): PublicTransportStopMarker[] {
  const physical = stops.filter((stop) => stop.type !== 'stop_position');
  const kept: PublicTransportStopMarker[] = [];
  const keptPositions: PublicTransportStopMarker[] = [];

  for (const stop of stops) {
    if (stop.type !== 'stop_position') {
      kept.push(stop);
      continue;
    }
    if (withinMergeRadius(stop, physical)) continue;
    if (withinMergeRadius(stop, keptPositions)) continue;
    keptPositions.push(stop);
    kept.push(stop);
  }

  return kept;
}

function itemsOfKind<K extends MapItem['kind']>(
  items: MapItem[],
  kind: K,
): Extract<MapItem, { kind: K }>[] {
  return items.flatMap((i) =>
    i.kind === kind ? [i as Extract<MapItem, { kind: K }>] : [],
  );
}

function stationItems(
  items: MapItem[],
  kind: StationItem['kind'],
): PoiMarker[] {
  return itemsOfKind(items, kind).map((i) => ({
    id: i.id,
    name: i.name,
    position: { x: i.x, z: i.z },
    width: i.width,
    depth: i.depth,
    area: i.area,
  }));
}

export interface Junction {
  position: Vec2;
  roadCount: number;
  radius: number;
}

function roundKey(v: number): number {
  return Math.round(v * 4);
}

function nodeHash(x: number, z: number): number {
  return roundKey(x) * 73856093 ^ roundKey(z) * 19349663;
}

const GRID_CELL = 60;
const GRID_SHIFT = 32768;

function cellKey(cx: number, cz: number): number {
  return (cx * 73856093) ^ (cz * 19349663);
}

export class JunctionGrid {
  private readonly cells = new Map<number, Junction[]>();

  constructor(junctions: Junction[]) {
    for (const j of junctions) {
      const cx = Math.floor(j.position.x / GRID_CELL) + GRID_SHIFT;
      const cz = Math.floor(j.position.z / GRID_CELL) + GRID_SHIFT;
      const key = cellKey(cx, cz);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(j);
    }
  }

  near(x: number, z: number, radius: number): Junction[] {
    return this.nearBBox(x - radius, x + radius, z - radius, z + radius);
  }

  nearBBox(minX: number, maxX: number, minZ: number, maxZ: number): Junction[] {
    const out: Junction[] = [];
    const minCx = Math.floor(minX / GRID_CELL) + GRID_SHIFT;
    const maxCx = Math.floor(maxX / GRID_CELL) + GRID_SHIFT;
    const minCz = Math.floor(minZ / GRID_CELL) + GRID_SHIFT;
    const maxCz = Math.floor(maxZ / GRID_CELL) + GRID_SHIFT;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(cellKey(cx, cz));
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
}

interface JunctionNode {
  x: number;
  z: number;
  arms: Map<number, number>;
}

export function findJunctions(roads: PolylineRoad[]): Junction[] {
  const nodes = new Map<number, JunctionNode>();
  const roadWidths = new Map<number, number>();

  function nodeAt(x: number, z: number): JunctionNode {
    const hash = nodeHash(x, z);
    let node = nodes.get(hash);
    if (!node) {
      node = { x, z, arms: new Map() };
      nodes.set(hash, node);
    }
    return node;
  }

  function addArms(node: JunctionNode, roadId: number, arms: number): void {
    const current = node.arms.get(roadId) ?? 0;
    if (arms > current) node.arms.set(roadId, arms);
  }

  roads.forEach((road, idx) => {
    const pts = road.points;
    if (pts.length < 2) return;
    roadWidths.set(idx, road.width);

    addArms(nodeAt(pts[0].x, pts[0].z), idx, 1);
    const last = pts[pts.length - 1];
    addArms(nodeAt(last.x, last.z), idx, 1);

    for (let i = 1; i < pts.length - 1; i++) {
      addArms(nodeAt(pts[i].x, pts[i].z), idx, 2);
    }
  });

  const junctions: Junction[] = [];
  for (const node of nodes.values()) {
    if (node.arms.size < 2) continue;
    let arms = 0;
    let maxW = 0;
    for (const [rid, count] of node.arms) {
      arms += count;
      const w = roadWidths.get(rid) ?? 6;
      if (w > maxW) maxW = w;
    }
    if (arms < 3) continue;
    junctions.push({
      position: { x: node.x, z: node.z },
      roadCount: arms,
      radius: maxW / 2,
    });
  }

  return junctions;
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

    roads.push({ name: road.name ?? '', type: road.type, lanes: road.lanes, width, oneway: road.oneway, access: road.access, points });

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  }

  const padding = 50;

  const items = osmData.items ?? [];
  const features: MapFeatures = {
    trafficLights: itemsOfKind(items, 'trafficLight').map((i) => ({
      id: i.id,
      position: { x: i.x, z: i.z },
    })),
    pedestrianCrossings: itemsOfKind(items, 'pedestrianCrossing').map((i) => ({
      id: i.id,
      position: { x: i.x, z: i.z },
    })),
    publicTransportStops: dedupePublicTransportStops(
      itemsOfKind(items, 'busStop').map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        position: { x: i.x, z: i.z },
        width: i.width,
        depth: i.depth,
        area: i.area,
      })),
    ),
    gasStations: stationItems(items, 'gasStation'),
    fireStations: stationItems(items, 'fireStation'),
    hospitals: stationItems(items, 'hospital'),
    policeStations: stationItems(items, 'policeStation'),
  };

  return {
    roads,
    bounds: {
      minX: minX - padding,
      minZ: minZ - padding,
      maxX: maxX + padding,
      maxZ: maxZ + padding,
    },
    spawn: selectSpawn(roads),
    features,
    buildings: createBuildings(osmData.buildings ?? []),
  };
}
