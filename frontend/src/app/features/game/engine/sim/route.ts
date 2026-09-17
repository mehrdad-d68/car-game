import { isRestricted, RoadGraph } from './road-graph';
import { PolylineRoad, projectOntoRoad } from './track';
import { Vec2 } from './types';

export interface RouteStart {
  position: Vec2;
}

export interface Route {
  points: Vec2[];
  nodes: number[];
  length: number;
  street: string;
  cumulative: number[];
}

interface HeapEntry {
  node: number;
  g: number;
  f: number;
}

class MinHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    this.items.push(entry);
    this.siftUp(this.items.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const items = this.items;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.less(items[index], items[parent])) {
        [items[index], items[parent]] = [items[parent], items[index]];
        index = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    const items = this.items;
    const n = items.length;
    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = left + 1;
      if (left < n && this.less(items[left], items[smallest])) smallest = left;
      if (right < n && this.less(items[right], items[smallest])) smallest = right;
      if (smallest === index) break;
      [items[index], items[smallest]] = [items[smallest], items[index]];
      index = smallest;
    }
  }

  private less(a: HeapEntry, b: HeapEntry): boolean {
    return a.f < b.f || (a.f === b.f && a.node < b.node);
  }
}

function segmentIndexAt(points: Vec2[], along: number): number {
  let running = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    if (along <= running + len + 1e-6) return i;
    running += len;
  }
  return points.length - 2;
}

interface NearestSegment {
  roadIdx: number;
  si: number;
  segLen: number;
  lateral: number;
  t: number;
  projX: number;
  projZ: number;
}

function nearestAllowedSegment(
  graph: RoadGraph,
  roads: PolylineRoad[],
  position: Vec2,
  street: string,
): NearestSegment | null {
  let best: NearestSegment | null = null;

  for (let rid = 0; rid < roads.length; rid++) {
    const road = roads[rid];
    const points = road.points;
    if (points.length < 2) continue;
    const restricted = isRestricted(road.access);
    if (restricted && road.name.trim() !== street) continue;

    const { along, lateral } = projectOntoRoad(points, position);
    if (best && lateral >= best.lateral) continue;

    const si = segmentIndexAt(points, along);
    if (si === -1 || si >= points.length - 1) continue;
    const a = points[si];
    const b = points[si + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen < 1e-9) continue;

    let running = 0;
    for (let i = 0; i < si; i++) {
      running += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    }
    const t = segLen > 0 ? (along - running) / segLen : 0;

    best = {
      roadIdx: rid,
      si,
      segLen,
      lateral,
      t,
      projX: a.x + (b.x - a.x) * t,
      projZ: a.z + (b.z - a.z) * t,
    };
  }

  return best;
}

function bboxDistanceTo(node: Vec2, minX: number, minZ: number, maxX: number, maxZ: number): number {
  const dx = node.x < minX ? minX - node.x : node.x > maxX ? node.x - maxX : 0;
  const dz = node.z < minZ ? minZ - node.z : node.z > maxZ ? node.z - maxZ : 0;
  return Math.hypot(dx, dz);
}

export function planRoute(
  graph: RoadGraph,
  roads: PolylineRoad[],
  from: RouteStart,
  street: string,
): Route | null {
  const destNodes = graph.nodesByStreet.get(street);
  if (!destNodes || destNodes.length === 0) return null;
  const destSet = new Set(destNodes);

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const node of destNodes) {
    const p = graph.nodes[node];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const seed = nearestAllowedSegment(graph, roads, from.position, street);
  if (!seed) return null;

  const roadIds = graph.roadNodeIds[seed.roadIdx];
  const segA = roadIds[seed.si];
  const segB = roadIds[seed.si + 1];
  const oneway = roads[seed.roadIdx].oneway;

  const distA = seed.t * seed.segLen;
  const distB = seed.segLen - distA;

  const seeds: [number, number][] = [];
  if (oneway === 1) {
    seeds.push([segB, distB]);
  } else if (oneway === -1) {
    seeds.push([segA, distA]);
  } else {
    seeds.push([segA, distA], [segB, distB]);
  }

  const n = graph.nodes.length;
  const dist = new Float64Array(n);
  dist.fill(Infinity);
  const cameFrom = new Int32Array(n);
  cameFrom.fill(-1);
  const heap = new MinHeap();

  const heuristic = (node: number): number => {
    return bboxDistanceTo(graph.nodes[node], minX, minZ, maxX, maxZ);
  };

  for (const [node, g] of seeds) {
    if (node >= 0 && g < dist[node]) {
      dist[node] = g;
      heap.push({ node, g, f: g + heuristic(node) });
    }
  }

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (current.g > dist[current.node]) continue;
    if (destSet.has(current.node)) {
      const reversed: number[] = [current.node];
      let prev = cameFrom[current.node];
      while (prev !== -1) {
        reversed.push(prev);
        prev = cameFrom[prev];
      }
      const nodes = reversed.reverse();
      // Copy, don't alias: the graph's nodes are shared by every route planned after this one.
      const points: Vec2[] = [{ x: seed.projX, z: seed.projZ }];
      for (const node of nodes) {
        points.push({ x: graph.nodes[node].x, z: graph.nodes[node].z });
      }
      const cumulative: number[] = [0];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        cumulative.push(
          cumulative[i] +
            Math.hypot(b.x - a.x, b.z - a.z),
        );
      }
      return {
        points,
        nodes,
        length: cumulative[cumulative.length - 1],
        street,
        cumulative,
      };
    }

    for (const edge of graph.out[current.node]) {
      if (edge.restricted && roads[edge.road].name.trim() !== street) continue;
      const g2 = current.g + edge.cost;
      if (g2 < dist[edge.to]) {
        dist[edge.to] = g2;
        cameFrom[edge.to] = current.node;
        heap.push({ node: edge.to, g: g2, f: g2 + heuristic(edge.to) });
      }
    }
  }

  return null;
}