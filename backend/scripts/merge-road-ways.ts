import { OSMMapData, OSMRoad, Point } from '../src/modules/map/osm-types';

interface Endpoint {
  road: OSMRoad;
  atStart: boolean;
}

function roundKey(v: number): number {
  return Math.round(v * 4);
}

function nodeHash(x: number, z: number): number {
  return roundKey(x) * 73856093 ^ roundKey(z) * 19349663;
}

function sameStreet(a: OSMRoad, b: OSMRoad): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.oneway === b.oneway &&
    a.access === b.access
  );
}

function roadLength(road: OSMRoad): number {
  let len = 0;
  for (let i = 1; i < road.points.length; i++) {
    const dx = road.points[i].x - road.points[i - 1].x;
    const dz = road.points[i].z - road.points[i - 1].z;
    len += Math.hypot(dx, dz);
  }
  return len;
}

function pick<T>(
  a: OSMRoad,
  b: OSMRoad,
  attr: (r: OSMRoad) => T,
): T {
  if (attr(a) === attr(b)) return attr(a);
  return roadLength(a) >= roadLength(b) ? attr(a) : attr(b);
}

function travelEndsAt(endpoint: Endpoint): boolean {
  return endpoint.road.oneway === -1 ? endpoint.atStart : !endpoint.atStart;
}

function oneWayJoin(a: Endpoint, b: Endpoint): Point[] {
  const oneway = a.road.oneway;
  const travelOrder = (ep: Endpoint): Point[] =>
    oneway === 1 ? ep.road.points : [...ep.road.points].reverse();
  const incoming = travelEndsAt(a) ? a : b;
  const outgoing = travelEndsAt(a) ? b : a;
  const chained = travelOrder(incoming).concat(travelOrder(outgoing).slice(1));
  return oneway === 1 ? chained : [...chained].reverse();
}

function join(a: Endpoint, b: Endpoint): OSMRoad {
  const oneway = pick(a.road, b.road, (r) => r.oneway);
  let points: Point[];
  if (oneway === 0) {
    const pathA = a.atStart ? [...a.road.points].reverse() : a.road.points;
    const pathB = b.atStart ? b.road.points : [...b.road.points].reverse();
    points = pathA.concat(pathB.slice(1));
  } else {
    points = oneWayJoin(a, b);
  }
  return {
    id: Math.min(a.road.id, b.road.id),
    name: a.road.name,
    type: pick(a.road, b.road, (r) => r.type),
    lanes: pick(a.road, b.road, (r) => r.lanes),
    width: pick(a.road, b.road, (r) => r.width),
    oneway: pick(a.road, b.road, (r) => r.oneway),
    access: pick(a.road, b.road, (r) => r.access),
    points,
  };
}

export function mergeRoadWays(roads: OSMRoad[]): OSMRoad[] {
  const result = roads.slice();

  while (true) {
    const endpoints = new Map<number, Endpoint[]>();
    for (const road of result) {
      const first = road.points[0];
      const last = road.points[road.points.length - 1];
      const push = (key: number, endpoint: Endpoint) => {
        let list = endpoints.get(key);
        if (!list) {
          list = [];
          endpoints.set(key, list);
        }
        list.push(endpoint);
      };
      push(nodeHash(first.x, first.z), { road, atStart: true });
      push(nodeHash(last.x, last.z), { road, atStart: false });
    }

    let merged = false;
    for (const list of endpoints.values()) {
      if (list.length !== 2) continue;
      const [a, b] = list;
      if (a.road === b.road) continue;
      if (!sameStreet(a.road, b.road)) continue;
      if (a.road.oneway !== 0 && travelEndsAt(a) === travelEndsAt(b)) continue;
      const joined = join(a, b);
      const iA = result.indexOf(a.road);
      const iB = result.indexOf(b.road);
      result[Math.min(iA, iB)] = joined;
      result.splice(Math.max(iA, iB), 1);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  return result;
}

export function mergeMapData(data: OSMMapData): OSMMapData {
  const roads = mergeRoadWays(data.roads);
  return {
    ...data,
    meta: {
      ...data.meta,
      totalRoads: roads.length,
    },
    roads,
  };
}