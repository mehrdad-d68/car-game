import { Building, BuildingGrid, tileKey, TILE_SIZE } from './buildings';
import { makeGeoUnprojector } from './geo';
import { RoadGraph } from './road-graph';
import { MapItemKind } from './osm-types';
import { PolylineRoad, projectOntoRoad, TrackData } from './track';
import { CarState, Vec2 } from './types';

const NODE_LOOKUP_RADIUS = 25;
const BUILDING_LOOKUP_RADIUS = 30;
const NEARBY_RADIUS = 20;
const NEARBY_MAX = 4;

export interface InspectRoadInfo {
  index: number;
  name: string;
  type: string;
  width: number;
  lanes: number;
  oneway: 0 | 1 | -1;
  lateral: number;
}

export interface InspectNodeInfo {
  id: number;
  junction: boolean;
  arms: number;
  distance: number;
}

export interface InspectBuildingInfo {
  id: number;
  style: string;
  floors: number;
  inside: boolean;
  distance: number;
}

export interface NearbyFeature {
  kind: string;
  distance: number;
}

export interface InspectReport {
  x: number;
  z: number;
  lat: number;
  lng: number;
  road: InspectRoadInfo | null;
  node: InspectNodeInfo | null;
  building: InspectBuildingInfo | null;
  nearby: NearbyFeature[];
}

export interface RouteSummary {
  street: string;
  remaining: number;
  next: { maneuver: string; street: string; distance: number } | null;
}

export interface ReportExtras {
  hit: string | null;
  car: CarState | null;
  route: RouteSummary | null;
  map: string | null;
}

const NEARBY_LABEL: Record<MapItemKind, string> = {
  trafficLight: 'traffic light',
  pedestrianCrossing: 'crossing',
  busStop: 'bus stop',
  gasStation: 'gas station',
  fireStation: 'fire station',
  hospital: 'hospital',
  policeStation: 'police station',
};

function pointInRing(ring: Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const crosses =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ringDistance(ring: Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[i].x;
    const az = ring[i].z;
    const bx = ring[j].x;
    const bz = ring[j].z;
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    let t = 0;
    if (lenSq > 1e-12) {
      t = ((x - ax) * dx + (z - az) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

function nearestRoad(
  roads: PolylineRoad[],
  position: Vec2,
): { index: number; road: PolylineRoad; lateral: number } | null {
  let best: { index: number; road: PolylineRoad; lateral: number } | null = null;
  for (let index = 0; index < roads.length; index++) {
    const road = roads[index];
    if (road.points.length < 2) continue;
    const { lateral } = projectOntoRoad(road.points, position);
    if (!best || lateral < best.lateral) {
      best = { index, road, lateral };
    }
  }
  return best;
}

function buildingNeighbours(grid: BuildingGrid, x: number, z: number): Building[] {
  const out: Building[] = [];
  const tx = Math.floor(x / TILE_SIZE);
  const tz = Math.floor(z / TILE_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      out.push(...grid.buildingsIn(tileKey(tx + dx, tz + dz)));
    }
  }
  return out;
}

function nearestBuilding(
  grid: BuildingGrid,
  x: number,
  z: number,
): { building: Building; inside: boolean; distance: number } | null {
  let best: { building: Building; inside: boolean; distance: number } | null = null;
  for (const building of buildingNeighbours(grid, x, z)) {
    if (pointInRing(building.points, x, z)) {
      return { building, inside: true, distance: 0 };
    }
  }
  for (const building of buildingNeighbours(grid, x, z)) {
    const distance = ringDistance(building.points, x, z);
    if (distance > BUILDING_LOOKUP_RADIUS) continue;
    if (!best || distance < best.distance) {
      best = { building, inside: false, distance };
    }
  }
  return best;
}

function nodeArms(graph: RoadGraph): Uint32Array {
  const arms = new Uint32Array(graph.nodes.length);
  for (const ids of graph.roadNodeIds) {
    if (ids.length === 0) continue;
    for (let i = 0; i < ids.length; i++) {
      arms[ids[i]] += i === 0 || i === ids.length - 1 ? 1 : 2;
    }
  }
  return arms;
}

function nearestNodeInfo(
  graph: RoadGraph,
  arms: Uint32Array,
  x: number,
  z: number,
): InspectNodeInfo | null {
  let best: InspectNodeInfo | null = null;
  for (let id = 0; id < graph.nodes.length; id++) {
    const p = graph.nodes[id];
    const distance = Math.hypot(p.x - x, p.z - z);
    if (distance > NODE_LOOKUP_RADIUS) continue;
    if (!best || distance < best.distance) {
      best = {
        id,
        junction: graph.junction[id] === 1,
        arms: arms[id],
        distance,
      };
    }
  }
  return best;
}

function collectNearby(track: TrackData, x: number, z: number): NearbyFeature[] {
  const features: { label: string; x: number; z: number }[] = [];
  for (const kind of Object.keys(NEARBY_LABEL) as MapItemKind[]) {
    const key = featureKey(kind);
    for (const item of track.features[key]) {
      features.push({ label: NEARBY_LABEL[kind], x: item.position.x, z: item.position.z });
    }
  }
  const nearby: NearbyFeature[] = [];
  for (const feature of features) {
    const distance = Math.hypot(feature.x - x, feature.z - z);
    if (distance <= NEARBY_RADIUS) nearby.push({ kind: feature.label, distance });
  }
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, NEARBY_MAX);
}

function featureKey(
  kind: MapItemKind,
): keyof TrackData['features'] {
  switch (kind) {
    case 'trafficLight':
      return 'trafficLights';
    case 'pedestrianCrossing':
      return 'pedestrianCrossings';
    case 'busStop':
      return 'publicTransportStops';
    case 'gasStation':
      return 'gasStations';
    case 'fireStation':
      return 'fireStations';
    case 'hospital':
      return 'hospitals';
    case 'policeStation':
      return 'policeStations';
  }
}

export function inspectPoint(
  track: TrackData,
  graph: RoadGraph,
  x: number,
  z: number,
): InspectReport {
  const pos: Vec2 = { x, z };
  const unproject = makeGeoUnprojector(track.meta.center);
  const coords = unproject(x, z);

  const nearest = nearestRoad(track.roads, pos);
  const road: InspectRoadInfo | null = nearest
    ? {
        index: nearest.index,
        name: nearest.road.name,
        type: nearest.road.type,
        width: nearest.road.width,
        lanes: nearest.road.lanes,
        oneway: nearest.road.oneway,
        lateral: nearest.lateral,
      }
    : null;

  const arms = nodeArms(graph);
  const node = nearestNodeInfo(graph, arms, x, z) ?? null;

  const grid = new BuildingGrid(track.buildings);
  const hit = nearestBuilding(grid, x, z);
  const buildingInfo: InspectBuildingInfo | null = hit
    ? {
        id: hit.building.id,
        style: hit.building.style,
        floors: hit.building.floors,
        inside: hit.inside,
        distance: hit.distance,
      }
    : null;

  return {
    x,
    z,
    lat: coords.lat,
    lng: coords.lng,
    road,
    node,
    building: buildingInfo,
    nearby: collectNearby(track, x, z),
  };
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatFixed(value: number): string {
  return value.toFixed(1);
}

function maneuverWord(maneuver: string): string {
  switch (maneuver) {
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'uturn':
      return 'U-turn';
    case 'arrive':
      return 'arrive';
    default:
      return 'straight';
  }
}

function roadLine(report: InspectReport): string | null {
  const r = report.road;
  if (!r) return null;
  const quoted = r.name.trim() ? ` "${r.name.trim()}"` : '';
  return `road: #${r.index}${quoted} ${r.type} · w=${r.width} m · lanes=${r.lanes} · oneway=${r.oneway} · ${formatFixed(r.lateral)} m from centre line`;
}

function nodeLine(report: InspectReport): string | null {
  const n = report.node;
  if (!n) return null;
  const junction = n.junction ? ` junction, ${n.arms} arms` : '';
  return `node: #${n.id}${junction} · ${formatFixed(n.distance)} m away`;
}

function buildingLine(report: InspectReport): string | null {
  const b = report.building;
  if (!b) return null;
  const where = b.inside
    ? 'point is inside'
    : `${formatFixed(b.distance)} m away`;
  return `building: #${b.id} ${b.style} · ${b.floors} floors · ${where}`;
}

function nearbyLine(report: InspectReport): string | null {
  if (report.nearby.length === 0) return null;
  const parts = report.nearby.map(
    (feature) => `${feature.kind} ${formatFixed(feature.distance)} m`,
  );
  return `nearby: ${parts.join(' · ')}`;
}

function carLine(extras: ReportExtras, x: number, z: number): string | null {
  const car = extras.car;
  if (!car) return null;
  const degrees = Math.round(((car.heading * 180) / Math.PI) % 360);
  const distance = Math.round(Math.hypot(car.position.x - x, car.position.z - z));
  return `car: x=${formatFixed(car.position.x)} z=${formatFixed(car.position.z)} · heading ${degrees}° · ${distance} m away`;
}

function routeLine(extras: ReportExtras): string | null {
  const route = extras.route;
  if (!route) return null;
  const next = route.next
    ? ` · next: ${maneuverWord(route.next.maneuver)} onto ${
        route.next.street || 'the street'
      } in ${formatFixed(route.next.distance)} m`
    : '';
  return `route: to "${route.street}" · ${formatFixed(route.remaining)} m along${next}`;
}

function mapLine(extras: ReportExtras): string | null {
  if (!extras.map) return null;
  return `map: ${extras.map}`;
}

export function formatReport(
  pin: number,
  report: InspectReport,
  extras: ReportExtras,
): string {
  const lines: string[] = [
    `[pin ${pin}] x=${formatFixed(report.x)} z=${formatFixed(report.z)} · ${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}`,
  ];
  if (extras.hit) lines.push(`hit: ${extras.hit}`);
  const road = roadLine(report);
  if (road) lines.push(road);
  const node = nodeLine(report);
  if (node) lines.push(node);
  const building = buildingLine(report);
  if (building) lines.push(building);
  const nearby = nearbyLine(report);
  if (nearby) lines.push(nearby);
  const car = carLine(extras, report.x, report.z);
  if (car) lines.push(car);
  const route = routeLine(extras);
  if (route) lines.push(route);
  const map = mapLine(extras);
  if (map) lines.push(map);
  return lines.join('\n');
}

export function nearestRoadHeading(track: TrackData, x: number, z: number): number {
  const nearest = nearestRoad(track.roads, { x, z });
  if (!nearest) return 0;
  const points = nearest.road.points;
  let best = Infinity;
  let dir: Vec2 | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - a.x) * dx + (z - a.z) * dz) / (len * len),
      ),
    );
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best) {
      best = distance;
      dir = { x: dx / len, z: dz / len };
    }
  }
  if (!dir) return 0;
  return Math.atan2(-dir.x, -dir.z);
}