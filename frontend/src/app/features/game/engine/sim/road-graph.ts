import { nodeHash } from './node-key';
import { PolylineRoad, roadClass } from './track';
import { Vec2 } from './types';

export interface GraphEdge {
  to: number;
  length: number;
  cost: number;
  road: number;
  restricted: boolean;
}

export interface RoadGraph {
  nodes: Vec2[];
  out: GraphEdge[][];
  nodesByStreet: Map<string, number[]>;
  roadNodeIds: number[][];
  junction: Uint8Array;
}

export function isRestricted(access: string): boolean {
  return access === 'private' || access === 'no';
}

export function buildRoadGraph(roads: PolylineRoad[]): RoadGraph {
  const byHash = new Map<number, number>();
  const nodes: Vec2[] = [];
  const arms: number[] = [];
  const out: GraphEdge[][] = [];
  const roadNodeIds: number[][] = [];

  function nodeAt(x: number, z: number): number {
    const hash = nodeHash(x, z);
    let id = byHash.get(hash);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x, z });
      arms.push(0);
      out.push([]);
      byHash.set(hash, id);
    }
    return id;
  }

  function addEdge(
    from: number,
    to: number,
    length: number,
    cost: number,
    road: number,
    restricted: boolean,
  ): void {
    if (from === to || length < 1e-6) return;
    out[from].push({ to, length, cost, road, restricted });
  }

  for (let rid = 0; rid < roads.length; rid++) {
    const road = roads[rid];
    const pts = road.points;
    // Keep roadNodeIds index-aligned with roads, so callers can index it by road id.
    if (pts.length < 2) {
      roadNodeIds.push([]);
      continue;
    }

    const ids: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const id = nodeAt(pts[i].x, pts[i].z);
      ids.push(id);
      arms[id] += i === 0 || i === pts.length - 1 ? 1 : 2;
    }
    roadNodeIds.push(ids);

    const restricted = isRestricted(road.access);
    const multiplier = roadClass(road.type) === 'service' ? 2 : 1;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const from = ids[i];
      const to = ids[i + 1];
      if (from === to || length < 1e-6) continue;
      const cost = length * multiplier;
      if (road.oneway !== -1) addEdge(from, to, length, cost, rid, restricted);
      if (road.oneway !== 1) addEdge(to, from, length, cost, rid, restricted);
    }
  }

  const nodesByStreet = new Map<string, Set<number>>();
  for (let rid = 0; rid < roads.length; rid++) {
    const name = roads[rid].name.trim();
    if (!name) continue;
    let set = nodesByStreet.get(name);
    if (!set) {
      set = new Set();
      nodesByStreet.set(name, set);
    }
    for (const id of roadNodeIds[rid]) {
      set.add(id);
    }
  }

  const street = new Map<string, number[]>();
  for (const [name, set] of nodesByStreet) {
    street.set(name, [...set]);
  }

  const junction = new Uint8Array(nodes.length);
  for (let i = 0; i < arms.length; i++) {
    if (arms[i] >= 3) junction[i] = 1;
  }

  return { nodes, out, nodesByStreet: street, roadNodeIds, junction };
}