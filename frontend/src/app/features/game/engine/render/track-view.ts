import * as THREE from 'three';
import {
  findJunctions,
  Junction,
  JunctionGrid,
  markingPattern,
  PolylineRoad,
  projectOntoRoad,
  RoadClass,
  roadClass,
  TrackData,
} from '../sim/track';
import { Vec2 } from '../sim/types';
import { ROAD_HEIGHT, SURFACE_OFFSET } from './constants';
import { makeArrowMesh, makeLabelMesh } from './text-label';
import { cumulativeDistances, createRoadTextures, metresToUv, RoadTextures } from './road-textures';
import { applyMarkingsShader, markingStyleValue } from './markings-shader';

const GROUND_HEIGHT = 0;
const SIGN_HEIGHT = ROAD_HEIGHT + 0.1;
const LABEL_RADIUS = 300;
const LABEL_CELL = 600;
const LABEL_SPACING = 60;
const LABEL_MIN_LENGTH = 3;
const LABEL_JOIN_TOLERANCE = 8;
const LABEL_SCALE = 0.75;
const DIRECTION_ARROW_SPACING = 90;
const DIRECTION_ARROW_LANE_MARGIN = 1.5;
const DIRECTION_ARROW_SCALE = 0.45;
const BARRIER_HEIGHT = 0.9;
const BARRIER_DEPTH = 1.4;
const BARRIER_COLOR = 0xffb300;
const SIDEWALK_WIDTH = 2.5;
const SIDEWALK_RISE = 0.15;
const SIDEWALK_TOP = ROAD_HEIGHT + SIDEWALK_RISE;
const JUNCTION_PAD = 0.2;
const ROAD_CELL = 60;
const ROAD_GRID_SHIFT = 32768;

function roadCellKey(cx: number, cz: number): number {
  return (cx * 73856093) ^ (cz * 19349663);
}

function sidewalkWidth(roadWidth: number): number {
  return Math.min(SIDEWALK_WIDTH, roadWidth * 0.3);
}

class RoadGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(roads: PolylineRoad[]) {
    for (let i = 0; i < roads.length; i++) {
      const pts = roads[i].points;
      if (pts.length < 2) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const minCx = Math.floor(minX / ROAD_CELL) + ROAD_GRID_SHIFT;
      const maxCx = Math.floor(maxX / ROAD_CELL) + ROAD_GRID_SHIFT;
      const minCz = Math.floor(minZ / ROAD_CELL) + ROAD_GRID_SHIFT;
      const maxCz = Math.floor(maxZ / ROAD_CELL) + ROAD_GRID_SHIFT;
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = roadCellKey(cx, cz);
          let bucket = this.cells.get(key);
          if (!bucket) {
            bucket = [];
            this.cells.set(key, bucket);
          }
          bucket.push(i);
        }
      }
    }
  }

  near(x: number, z: number, radius: number): number[] {
    const out = new Set<number>();
    const minCx = Math.floor((x - radius) / ROAD_CELL) + ROAD_GRID_SHIFT;
    const maxCx = Math.floor((x + radius) / ROAD_CELL) + ROAD_GRID_SHIFT;
    const minCz = Math.floor((z - radius) / ROAD_CELL) + ROAD_GRID_SHIFT;
    const maxCz = Math.floor((z + radius) / ROAD_CELL) + ROAD_GRID_SHIFT;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(roadCellKey(cx, cz));
        if (bucket) {
          for (const id of bucket) out.add(id);
        }
      }
    }
    return [...out];
  }
}

interface Sign {
  position: Vec2;
  label: THREE.Mesh;
}

interface EdgeStrip {
  left: Vec2[];
  right: Vec2[];
  px: number[];
  pz: number[];
}

function computeEdgeStrip(points: Vec2[], halfWidth: number): EdgeStrip {
  const MITER_LIMIT = 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const pxArr: number[] = [];
  const pzArr: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    let px: number;
    let pz: number;

    if (!prev) {
      const dx = next!.x - curr.x;
      const dz = next!.z - curr.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 1e-6) {
        px = 0;
        pz = 1;
      } else {
        px = -dz / len;
        pz = dx / len;
      }
    } else if (!next) {
      const dx = curr.x - prev.x;
      const dz = curr.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 1e-6) {
        px = 0;
        pz = 1;
      } else {
        px = -dz / len;
        pz = dx / len;
      }
    } else {
      const dx1 = curr.x - prev.x;
      const dz1 = curr.z - prev.z;
      const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
      const dx2 = next.x - curr.x;
      const dz2 = next.z - curr.z;
      const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

      if (len1 < 1e-6 || len2 < 1e-6) {
        px = 0;
        pz = 1;
      } else {
        const n1x = -dz1 / len1;
        const n1z = dx1 / len1;
        const n2x = -dz2 / len2;
        const n2z = dx2 / len2;
        const mx = n1x + n2x;
        const mz = n1z + n2z;
        const mLen = Math.sqrt(mx * mx + mz * mz);
        if (mLen < 1e-6) {
          px = n1x;
          pz = n1z;
        } else {
          const cosHalf = mLen / 2;
          const scale = cosHalf < 1e-6 ? MITER_LIMIT : Math.min(1 / cosHalf, MITER_LIMIT);
          px = (mx / mLen) * scale;
          pz = (mz / mLen) * scale;
        }
      }
    }

    left.push({ x: curr.x + px * halfWidth, z: curr.z + pz * halfWidth });
    right.push({ x: curr.x - px * halfWidth, z: curr.z - pz * halfWidth });
    pxArr.push(px);
    pzArr.push(pz);
  }

  return { left, right, px: pxArr, pz: pzArr };
}

function pointAlong(points: Vec2[], t: number): Vec2 {
  let total = 0;
  const lengths: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    total += Math.hypot(dx, dz);
    lengths.push(total);
  }
  const target = Math.min(Math.max(t * total, 0), total);
  for (let i = 0; i < lengths.length - 1; i++) {
    if (target <= lengths[i + 1]) {
      const segLen = lengths[i + 1] - lengths[i] || 1;
      const u = (target - lengths[i]) / segLen;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * u,
        z: points[i].z + (points[i + 1].z - points[i].z) * u,
      };
    }
  }
  return points[points.length - 1];
}

function tangentAngle(points: Vec2[], t: number): number {  let total = 0;
  const lengths: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    total += Math.hypot(dx, dz);
    lengths.push(total);
  }
  const target = Math.min(Math.max(t * total, 0), total);
  for (let i = 0; i < lengths.length - 1; i++) {
    if (target <= lengths[i + 1] || i === lengths.length - 2) {
      return Math.atan2(
        points[i + 1].z - points[i].z,
        points[i + 1].x - points[i].x,
      );
    }
  }
  const last = points.length - 1;
  return Math.atan2(points[last].z - points[last - 1].z, points[last].x - points[last - 1].x);
}

function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].z - points[i].z,
    );
  }
  return total;
}

export interface StreetLabelPlan {
  name: string;
  position: Vec2;
  tangent: number;
}

export function planStreetLabels(track: TrackData): StreetLabelPlan[] {
  const groups = new Map<string, Vec2[][]>();

  for (const road of track.roads) {
    const name = road.name?.trim();
    if (!name || road.points.length < 2) continue;
    const pts = road.points.slice();
    if (polylineLength(pts) < LABEL_MIN_LENGTH) continue;

    let placed = false;
    for (const chains of groups.values()) {
      for (const chain of chains) {
        if (
          Math.hypot(
            chain[chain.length - 1].x - pts[0].x,
            chain[chain.length - 1].z - pts[0].z,
          ) <= LABEL_JOIN_TOLERANCE
        ) {
          chain.push(...pts.slice(1));
          placed = true;
          break;
        }
        if (
          Math.hypot(
            chain[0].x - pts[pts.length - 1].x,
            chain[0].z - pts[pts.length - 1].z,
          ) <= LABEL_JOIN_TOLERANCE
        ) {
          chain.unshift(...pts.slice(0, -1));
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      let chains = groups.get(name);
      if (!chains) {
        chains = [];
        groups.set(name, chains);
      }
      chains.push(pts);
    }
  }

  const plans: StreetLabelPlan[] = [];
  for (const [name, chains] of groups) {
    for (const chain of chains) {
      const total = polylineLength(chain);
      const n = Math.max(1, Math.round(total / LABEL_SPACING));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        plans.push({
          name,
          position: pointAlong(chain, t),
          tangent: tangentAngle(chain, t),
        });
      }
    }
  }
  return plans;
}

export type DirectionKind = 'forward' | 'reverse';

export interface DirectionArrowPlan {
  x: number;
  z: number;
  phi: number;
  kind: DirectionKind;
}

function travelDirections(oneway: 0 | 1 | -1): DirectionKind[] {
  if (oneway === 1) return ['forward'];
  if (oneway === -1) return ['reverse'];
  return ['forward', 'reverse'];
}

function laneOffset(width: number): number {
  return Math.max(width / 2 - DIRECTION_ARROW_LANE_MARGIN, DIRECTION_ARROW_LANE_MARGIN);
}

export function directionArrowRotationY(phi: number): number {
  return Math.PI / 2 - phi;
}

export function filterArrowsByJunctions(
  plans: DirectionArrowPlan[],
  junctions: Junction[],
  grid: JunctionGrid = new JunctionGrid(junctions),
): DirectionArrowPlan[] {
  if (junctions.length === 0) return plans;
  let maxRadius = 0;
  for (const j of junctions) {
    if (j.radius > maxRadius) maxRadius = j.radius;
  }
  return plans.filter((p) => {
    for (const j of grid.near(p.x, p.z, maxRadius)) {
      if (Math.hypot(p.x - j.position.x, p.z - j.position.z) <= j.radius) {
        return false;
      }
    }
    return true;
  });
}

export function planDirectionArrows(track: TrackData): DirectionArrowPlan[] {
  const plans: DirectionArrowPlan[] = [];

  for (const road of track.roads) {
    const { points, width } = road;
    if (points.length < 2) continue;

    const dirs = travelDirections(road.oneway);
    const off = laneOffset(width);

    let total = 0;
    const lengths: number[] = [0];
    for (let i = 0; i < points.length - 1; i++) {
      total += Math.hypot(
        points[i + 1].x - points[i].x,
        points[i + 1].z - points[i].z,
      );
      lengths.push(total);
    }
    if (total < 1e-6) continue;

    const n = Math.max(1, Math.floor(total / DIRECTION_ARROW_SPACING));

    for (let i = 0; i < n; i++) {
      const target = ((i + 0.5) / n) * total;

      let px = points[points.length - 1].x;
      let pz = points[points.length - 1].z;
      let a = 0;
      for (let k = 0; k < lengths.length - 1; k++) {
        if (target <= lengths[k + 1]) {
          const segLen = lengths[k + 1] - lengths[k] || 1;
          const u = (target - lengths[k]) / segLen;
          px = points[k].x + (points[k + 1].x - points[k].x) * u;
          pz = points[k].z + (points[k + 1].z - points[k].z) * u;
          a = Math.atan2(
            points[k + 1].z - points[k].z,
            points[k + 1].x - points[k].x,
          );
          break;
        }
      }

      for (const kind of dirs) {
        const phi = kind === 'forward' ? a : a + Math.PI;
        const nx = -Math.sin(a);
        const nz = Math.cos(a);
        const side = kind === 'forward' ? 1 : -1;
        plans.push({
          x: px + nx * off * side,
          z: pz + nz * off * side,
          phi,
          kind,
        });
      }
    }
  }

  return plans;
}

export interface BarrierPlan {
  x: number;
  z: number;
  ux: number;
  uz: number;
  length: number;
}

const BARRIER_SCALE = 1.3;
const BARRIER_RETREAT = 1.6;
const BARRIER_STEP = 0.25;
const BARRIER_MAX_RETREAT = 25;
const BARRIER_MARGIN = 0.2;
const BARRIER_SEARCH_PAD = 20;

function roadAccess(road: PolylineRoad): string {
  return (road.access ?? '').trim().toLowerCase();
}

function isPrivateRoad(road: PolylineRoad): boolean {
  return roadAccess(road) === 'private';
}

function nodeKey(p: Vec2): string {
  return `${Math.round(p.x * 4)},${Math.round(p.z * 4)}`;
}

function directionAtDistance(points: Vec2[], dists: number[], s: number): Vec2 {
  let fallback: Vec2 = { x: 1, z: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const dir = unitVector(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    if (!dir) continue;
    fallback = dir;
    if (s <= dists[i + 1]) return dir;
  }
  return fallback;
}

function distanceToPolyline(points: Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const lenSq = sx * sx + sz * sz;
    const t = lenSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lenSq));
    const d = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t));
    if (d < best) best = d;
  }
  return best;
}

function barrierFootprint(centre: Vec2, ux: number, uz: number, length: number): Vec2[] {
  const hx = (ux * length) / 2;
  const hz = (uz * length) / 2;
  const dx = (uz * BARRIER_DEPTH) / 2;
  const dz = (-ux * BARRIER_DEPTH) / 2;
  const points: Vec2[] = [centre];
  for (const along of [-1, 0, 1]) {
    for (const across of [-1, 1]) {
      points.push({
        x: centre.x + along * hx + across * dx,
        z: centre.z + along * hz + across * dz,
      });
    }
  }
  return points;
}

function blockedByOtherRoad(
  footprint: Vec2[],
  owner: number,
  roads: PolylineRoad[],
  grid: RoadGrid,
  reach: number,
): boolean {
  const centre = footprint[0];
  for (const id of grid.near(centre.x, centre.z, reach)) {
    if (id === owner) continue;
    const other = roads[id];
    const clearance = other.width / 2 + edgeWalkWidth(other) + BARRIER_MARGIN;
    for (const p of footprint) {
      if (distanceToPolyline(other.points, p.x, p.z) < clearance) return true;
    }
  }
  return false;
}

function placeBarrier(
  points: Vec2[],
  owner: number,
  length: number,
  roads: PolylineRoad[],
  grid: RoadGrid,
): BarrierPlan | null {
  const dists = cumulativeDistances(points);
  const furthest = Math.min(dists[dists.length - 1] - BARRIER_DEPTH / 2, BARRIER_MAX_RETREAT);
  for (let s = BARRIER_RETREAT; s <= furthest; s += BARRIER_STEP) {
    const centre = pointAtDistance(points, dists, s);
    const dir = directionAtDistance(points, dists, s);
    const ux = -dir.z;
    const uz = dir.x;
    const footprint = barrierFootprint(centre, ux, uz, length);
    if (!blockedByOtherRoad(footprint, owner, roads, grid, length / 2 + BARRIER_SEARCH_PAD)) {
      return { x: centre.x, z: centre.z, ux, uz, length };
    }
  }
  return null;
}

function loopEntrance(points: Vec2[], nodeRoads: Map<string, Set<number>>): number {
  for (let i = 0; i < points.length - 1; i++) {
    if ((nodeRoads.get(nodeKey(points[i]))?.size ?? 0) > 1) return i;
  }
  return 0;
}

export function planBarriers(track: TrackData): BarrierPlan[] {
  const plans: BarrierPlan[] = [];
  const roads = track.roads;
  const grid = new RoadGrid(roads);
  const nodeRoads = new Map<string, Set<number>>();
  roads.forEach((road, index) => {
    for (const p of road.points) {
      const key = nodeKey(p);
      const set = nodeRoads.get(key);
      if (set) {
        set.add(index);
      } else {
        nodeRoads.set(key, new Set([index]));
      }
    }
  });

  roads.forEach((road, owner) => {
    if (!isPrivateRoad(road)) return;
    const pts = road.points;
    if (pts.length < 2) return;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const closed = Math.hypot(last.x - first.x, last.z - first.z) < 1e-6;
    const length = road.width * BARRIER_SCALE;

    const approaches: Vec2[][] = [];
    if (closed) {
      const entry = loopEntrance(pts, nodeRoads);
      approaches.push([...pts.slice(entry, pts.length - 1), ...pts.slice(0, entry + 1)]);
    } else {
      approaches.push(pts, [...pts].reverse());
    }

    for (const approach of approaches) {
      const plan = placeBarrier(approach, owner, length, roads, grid);
      if (plan) plans.push(plan);
    }
  });

  return plans;
}

function barrierRotationY(ux: number, uz: number): number {
  return Math.atan2(-uz, ux);
}

function appendAll(target: number[], source: number[], offset = 0): void {
  for (let i = 0; i < source.length; i++) {
    target.push(source[i] + offset);
  }
}

export type SidewalkSide = 'left' | 'right';

export interface SidewalkCut {
  side: SidewalkSide;
  start: number;
  end: number;
}

const CONTINUATION_SIN = Math.sin((15 * Math.PI) / 180);
const MIN_SPAN_LENGTH = 0.5;
const SIDES: readonly SidewalkSide[] = ['left', 'right'];

interface NodeVisit {
  road: number;
  s: number;
  length: number;
  tangent: Vec2;
  arms: Vec2[];
  through: boolean;
}

function unitVector(dx: number, dz: number): Vec2 | null {
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? null : { x: dx / len, z: dz / len };
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function visitAt(
  roadIndex: number,
  points: Vec2[],
  dists: number[],
  i: number,
): NodeVisit | null {
  const p = points[i];
  const back = i > 0 ? unitVector(points[i - 1].x - p.x, points[i - 1].z - p.z) : null;
  const ahead =
    i < points.length - 1 ? unitVector(points[i + 1].x - p.x, points[i + 1].z - p.z) : null;
  const arms = [back, ahead].filter((arm): arm is Vec2 => arm !== null);
  let tangent = ahead && back ? unitVector(ahead.x - back.x, ahead.z - back.z) : null;
  tangent = tangent ?? ahead ?? (back ? { x: -back.x, z: -back.z } : null);
  if (!tangent) return null;
  return {
    road: roadIndex,
    s: dists[i],
    length: dists[dists.length - 1],
    tangent,
    arms,
    through: arms.length === 2,
  };
}

function edgeWalkWidth(road: PolylineRoad): number {
  const cls = roadClass(road.type);
  return cls === 'service' || cls === 'shared' ? 0 : sidewalkWidth(road.width);
}

function winsCorner(a: NodeVisit, b: NodeVisit, roads: PolylineRoad[]): boolean {
  const wa = roads[a.road].width;
  const wb = roads[b.road].width;
  if (wa !== wb) return wa > wb;
  if (a.through !== b.through) return a.through;
  return a.road < b.road;
}

export function planSidewalkCuts(roads: PolylineRoad[]): Map<PolylineRoad, SidewalkCut[]> {
  const nodes = new Map<string, NodeVisit[]>();
  roads.forEach((road, roadIndex) => {
    const { points } = road;
    if (points.length < 2) return;
    const dists = cumulativeDistances(points);
    for (let i = 0; i < points.length; i++) {
      const visit = visitAt(roadIndex, points, dists, i);
      if (!visit) continue;
      const key = nodeKey(points[i]);
      const visits = nodes.get(key);
      if (visits) {
        visits.push(visit);
      } else {
        nodes.set(key, [visit]);
      }
    }
  });

  const cuts = new Map<PolylineRoad, SidewalkCut[]>();
  for (const visits of nodes.values()) {
    if (visits.length < 2) continue;
    for (const self of visits) {
      const road = roads[self.road];
      const kerbLine = road.width / 2;
      const walkEdge = kerbLine + edgeWalkWidth(road);
      for (const other of visits) {
        if (other.road === self.road) continue;
        const otherRoad = roads[other.road];
        const clearance =
          otherRoad.width / 2 + (winsCorner(other, self, roads) ? edgeWalkWidth(otherRoad) : 0);
        for (const arm of other.arms) {
          const cross = self.tangent.x * arm.z - self.tangent.z * arm.x;
          const sin = Math.abs(cross);
          if (sin < CONTINUATION_SIN) continue;
          const cot = (self.tangent.x * arm.x + self.tangent.z * arm.z) / sin;
          const halfGap = clearance / sin;
          const crossAtKerb = kerbLine * cot;
          const crossAtWalkEdge = walkEdge * cot;
          const start = Math.max(0, self.s + Math.min(crossAtKerb, crossAtWalkEdge) - halfGap);
          const end = Math.min(
            self.length,
            self.s + Math.max(crossAtKerb, crossAtWalkEdge) + halfGap,
          );
          if (end <= start) continue;
          const list = cuts.get(road) ?? [];
          list.push({ side: cross > 0 ? 'left' : 'right', start, end });
          cuts.set(road, list);
        }
      }
    }
  }
  return cuts;
}

function keptSpans(length: number, cuts: SidewalkCut[], side: SidewalkSide): [number, number][] {
  const removed = cuts
    .filter((cut) => cut.side === side)
    .map((cut): [number, number] => [cut.start, cut.end])
    .sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of removed) {
    if (start > cursor) spans.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) spans.push([cursor, length]);
  return spans.filter(([start, end]) => end - start >= MIN_SPAN_LENGTH);
}

function pointAtDistance(points: Vec2[], dists: number[], s: number): Vec2 {
  for (let i = 0; i < points.length - 1; i++) {
    if (s <= dists[i + 1] || i === points.length - 2) {
      const span = dists[i + 1] - dists[i];
      const t = span < 1e-9 ? 0 : Math.min(1, Math.max(0, (s - dists[i]) / span));
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        z: points[i].z + (points[i + 1].z - points[i].z) * t,
      };
    }
  }
  return points[0];
}

function subPolyline(
  points: Vec2[],
  dists: number[],
  start: number,
  end: number,
): { points: Vec2[]; dists: number[] } {
  const spanPoints: Vec2[] = [pointAtDistance(points, dists, start)];
  const spanDists: number[] = [start];
  for (let i = 0; i < points.length; i++) {
    if (dists[i] > start + 1e-6 && dists[i] < end - 1e-6) {
      spanPoints.push(points[i]);
      spanDists.push(dists[i]);
    }
  }
  spanPoints.push(pointAtDistance(points, dists, end));
  spanDists.push(end);
  return { points: spanPoints, dists: spanDists };
}

function emitSidewalkSpan(
  edge: EdgeStrip,
  dists: number[],
  side: SidewalkSide,
  walk: number,
  kerbPositions: number[],
  kerbIndices: number[],
  sidewalkPositions: number[],
  sidewalkUVs: number[],
  sidewalkIndices: number[],
): void {
  const inner = side === 'left' ? edge.left : edge.right;
  const sign = side === 'left' ? 1 : -1;
  const outer = inner.map((p, i) => ({
    x: p.x + sign * edge.px[i] * walk,
    z: p.z + sign * edge.pz[i] * walk,
  }));
  const sBase = sidewalkPositions.length / 3;
  const kBase = kerbPositions.length / 3;

  for (let i = 0; i < inner.length; i++) {
    const n = inner[i];
    const o = outer[i];
    sidewalkPositions.push(n.x, SIDEWALK_TOP, n.z, o.x, SIDEWALK_TOP, o.z);
    sidewalkUVs.push(
      metresToUv(0), metresToUv(dists[i]),
      metresToUv(walk), metresToUv(dists[i]),
    );
    kerbPositions.push(
      n.x, ROAD_HEIGHT, n.z,
      n.x, SIDEWALK_TOP, n.z,
      o.x, SIDEWALK_TOP, o.z,
      o.x, GROUND_HEIGHT, o.z,
    );
  }

  for (let i = 0; i < inner.length - 1; i++) {
    const n0 = sBase + i * 2;
    const o0 = n0 + 1;
    const n1 = n0 + 2;
    const o1 = n0 + 3;
    if (side === 'left') {
      sidewalkIndices.push(o0, o1, n0, n0, o1, n1);
    } else {
      sidewalkIndices.push(n0, n1, o0, o0, n1, o1);
    }

    const k0 = kBase + i * 4;
    const k1 = k0 + 4;
    kerbIndices.push(k0, k0 + 1, k1, k0 + 1, k1 + 1, k1);
    kerbIndices.push(k0 + 2, k0 + 3, k1 + 2, k0 + 3, k1 + 3, k1 + 2);
  }

  for (const i of [0, inner.length - 1]) {
    const cap = kerbPositions.length / 3;
    const n = inner[i];
    const o = outer[i];
    kerbPositions.push(
      n.x, SIDEWALK_TOP, n.z,
      o.x, SIDEWALK_TOP, o.z,
      o.x, GROUND_HEIGHT, o.z,
      n.x, GROUND_HEIGHT, n.z,
    );
    kerbIndices.push(cap, cap + 1, cap + 2, cap, cap + 2, cap + 3);
  }
}

function emitKerbDropSpan(
  edge: EdgeStrip,
  side: SidewalkSide,
  kerbPositions: number[],
  kerbIndices: number[],
): void {
  const inner = side === 'left' ? edge.left : edge.right;
  const base = kerbPositions.length / 3;
  for (const n of inner) {
    kerbPositions.push(n.x, ROAD_HEIGHT, n.z, n.x, GROUND_HEIGHT, n.z);
  }
  for (let i = 0; i < inner.length - 1; i++) {
    const k0 = base + i * 2;
    const k1 = k0 + 2;
    kerbIndices.push(k0, k1, k0 + 1, k0 + 1, k1, k1 + 1);
  }
}

export class TrackView {
  readonly group = new THREE.Group();

  private readonly signs: Sign[] = [];
  private readonly cells = new Map<number, Sign[]>();
  private readonly lastWindow = new Set<number>();
  private readonly arrowMeshes: { mesh: THREE.Mesh; position: Vec2 }[] = [];
  private readonly arrowCells = new Map<number, { mesh: THREE.Mesh; position: Vec2 }[]>();
  private readonly lastArrowWindow = new Set<number>();
  private readonly barrierMeshes: { mesh: THREE.Mesh; position: Vec2 }[] = [];
  private readonly barrierCells = new Map<number, { mesh: THREE.Mesh; position: Vec2 }[]>();
  private readonly lastBarrierWindow = new Set<number>();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly textures: RoadTextures;
  private readonly junctions: Junction[];
  private readonly junctionGrid: JunctionGrid;
  private readonly nearMargin: number;
  private readonly sidewalkCuts: Map<PolylineRoad, SidewalkCut[]>;

  constructor(private readonly track: TrackData) {
    this.textures = createRoadTextures((kind) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      return canvas.getContext('2d');
    });
    this.own(this.textures.major);
    this.own(this.textures.street);
    this.own(this.textures.service);
    this.own(this.textures.shared);
    this.own(this.textures.sidewalk);
    this.own(this.textures.ground);
    this.junctions = findJunctions(track.roads);
    this.junctionGrid = new JunctionGrid(this.junctions);
    let maxRadius = 0;
    for (const j of this.junctions) {
      if (j.radius > maxRadius) maxRadius = j.radius;
    }
    this.nearMargin = maxRadius + 5;
    this.sidewalkCuts = planSidewalkCuts(track.roads);
    this.buildGround();
    this.buildRoads();
    this.buildJunctionPatches();
  }

  buildLabels(): void {
    this.buildSigns();
    this.buildDirectionArrows();
    this.buildBarriers();
  }

  private own<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private buildGround(): void {
    const { bounds } = this.track;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    const ground = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(width, depth)),
      this.own(
        new THREE.MeshLambertMaterial({ map: this.textures.ground, color: 0xffffff }),
      ),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, GROUND_HEIGHT, centerZ);
    ground.receiveShadow = true;
    ground.name = 'ground';

    const positions = ground.geometry.getAttribute('position');
    const uvs = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      uvs[i * 2] = metresToUv(centerX + positions.getX(i));
      uvs[i * 2 + 1] = metresToUv(centerZ - positions.getY(i));
    }
    ground.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    this.group.add(ground);
  }

  private buildRoads(): void {
    const grouped = this.groupByClass();

    const allKerbPositions: number[] = [];
    const allKerbIndices: number[] = [];
    const allSidewalkPositions: number[] = [];
    const allSidewalkUVs: number[] = [];
    const allSidewalkIndices: number[] = [];

    for (const [cls, roads] of grouped) {
      const batch = this.buildRoadBatch(roads);

      const texKey = cls as keyof RoadTextures;
      const tex = this.textures[texKey];
      const material = this.own(
        new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff }),
      );
      material.polygonOffset = true;
      material.polygonOffsetFactor = this.polygonOffsetFactor(cls);
      material.polygonOffsetUnits = this.polygonOffsetFactor(cls);
      applyMarkingsShader(material);

      const mesh = new THREE.Mesh(batch.geometry, material);
      mesh.receiveShadow = true;
      mesh.name = `roads-${cls}`;
      this.group.add(mesh);

      const kerbBase = allKerbPositions.length / 3;
      appendAll(allKerbPositions, batch.kerb.positions);
      appendAll(allKerbIndices, batch.kerb.indices, kerbBase);

      const sidewalkBase = allSidewalkPositions.length / 3;
      appendAll(allSidewalkPositions, batch.sidewalk.positions);
      appendAll(allSidewalkUVs, batch.sidewalk.uvs);
      appendAll(allSidewalkIndices, batch.sidewalk.indices, sidewalkBase);
    }

    if (allKerbPositions.length > 0) {
      const kerbGeo = new THREE.BufferGeometry();
      kerbGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(allKerbPositions, 3),
      );
      kerbGeo.setIndex(allKerbIndices);
      kerbGeo.computeVertexNormals();
      const kerbMat = this.own(
        new THREE.MeshLambertMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide }),
      );
      kerbMat.polygonOffset = true;
      kerbMat.polygonOffsetFactor = SURFACE_OFFSET.kerb;
      kerbMat.polygonOffsetUnits = SURFACE_OFFSET.kerb;
      const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
      kerbMesh.receiveShadow = true;
      kerbMesh.name = 'kerbs';
      this.group.add(kerbMesh);
    }

    if (allSidewalkPositions.length > 0) {
      const swGeo = new THREE.BufferGeometry();
      swGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(allSidewalkPositions, 3),
      );
      swGeo.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(allSidewalkUVs, 2),
      );
      swGeo.setIndex(allSidewalkIndices);
      const upNormals = new Float32Array((allSidewalkPositions.length / 3) * 3);
      for (let i = 0; i < upNormals.length; i += 3) {
        upNormals[i + 1] = 1;
      }
      swGeo.setAttribute('normal', new THREE.BufferAttribute(upNormals, 3));

      const swMat = this.own(
        new THREE.MeshLambertMaterial({ map: this.textures.sidewalk, color: 0xffffff, side: THREE.DoubleSide }),
      );
      swMat.polygonOffset = true;
      swMat.polygonOffsetFactor = SURFACE_OFFSET.sidewalk;
      swMat.polygonOffsetUnits = SURFACE_OFFSET.sidewalk;
      const swMesh = new THREE.Mesh(swGeo, swMat);
      swMesh.receiveShadow = true;
      swMesh.name = 'sidewalks';
      this.group.add(swMesh);
    }
  }

  private buildJunctionPatches(): void {
    const roadGrid = new RoadGrid(this.track.roads);
    const collected = new Map<
      RoadClass,
      { positions: number[]; uvs: number[]; indices: number[] }
    >();

    for (const j of this.junctions) {
      const r = j.radius + JUNCTION_PAD;
      let maxWidth = 0;
      let cls: RoadClass = 'major';
      const pts: Vec2[] = [];

      for (const id of roadGrid.near(j.position.x, j.position.z, 50)) {
        const road = this.track.roads[id];
        const { points } = road;
        if (points.length < 2) continue;
        const roadCls = roadClass(road.type);
        if (roadCls === 'service' || roadCls === 'shared') continue;

        let near = false;
        for (const p of points) {
          if (Math.hypot(p.x - j.position.x, p.z - j.position.z) < 50) {
            near = true;
            break;
          }
        }
        if (!near) continue;

        if (road.width > maxWidth) {
          maxWidth = road.width;
          cls = roadCls;
        }

        const edge = computeEdgeStrip(points, road.width / 2);
        for (const v of [...edge.left, ...edge.right]) {
          const dx = v.x - j.position.x;
          const dz = v.z - j.position.z;
          const d = Math.hypot(dx, dz);
          if (d < r + 2) {
            pts.push({
              x: j.position.x + (dx / Math.max(d, 1e-4)) * r,
              z: j.position.z + (dz / Math.max(d, 1e-4)) * r,
            });
          }
        }
      }

      if (pts.length < 3) continue;

      const angles = new Set<number>();
      for (const p of pts) {
        const a = Math.atan2(p.z - j.position.z, p.x - j.position.x);
        angles.add(Math.round(a * 50) / 50);
      }
      if (angles.size < 3) continue;

      const sorted = [...angles]
        .sort((a, b) => a - b)
        .map((a) => ({
          x: j.position.x + Math.cos(a) * r,
          z: j.position.z + Math.sin(a) * r,
        }));

      let collector = collected.get(cls);
      if (!collector) {
        collector = { positions: [], uvs: [], indices: [] };
        collected.set(cls, collector);
      }
      const center = collector.positions.length / 3;
      collector.positions.push(j.position.x, ROAD_HEIGHT + 0.002, j.position.z);
      collector.uvs.push(metresToUv(j.position.x), metresToUv(j.position.z));
      for (const p of sorted) {
        collector.positions.push(p.x, ROAD_HEIGHT + 0.002, p.z);
        collector.uvs.push(metresToUv(p.x), metresToUv(p.z));
      }
      const count = sorted.length;
      for (let i = 0; i < count; i++) {
        collector.indices.push(
          center,
          center + 1 + i,
          center + 1 + ((i + 1) % count),
        );
      }
    }

    for (const [cls, collector] of collected) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(collector.positions, 3),
      );
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(collector.uvs, 2),
      );
      const normals = new Float32Array((collector.positions.length / 3) * 3);
      for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1;
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(collector.indices);

      const material = this.own(
        new THREE.MeshLambertMaterial({ map: this.textures[cls], color: 0xffffff }),
      );
      material.polygonOffset = true;
      material.polygonOffsetFactor = SURFACE_OFFSET.junction;
      material.polygonOffsetUnits = SURFACE_OFFSET.junction;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.name = 'junction-patch';
      this.group.add(mesh);
    }
  }

  private polygonOffsetFactor(cls: RoadClass): number {
    switch (cls) {
      case 'major':
        return SURFACE_OFFSET.major;
      case 'street':
        return SURFACE_OFFSET.street;
      default:
        return 0;
    }
  }

  private buildSigns(): void {
    for (const plan of planStreetLabels(this.track)) {
      const label = makeLabelMesh(plan.name, 'white');
      if (!label) continue;

      label.rotation.set(-Math.PI / 2, 0, -plan.tangent);
      label.position.set(plan.position.x, SIGN_HEIGHT, plan.position.z);
      label.renderOrder = 5;
      label.scale.setScalar(LABEL_SCALE);
      label.visible = false;
      this.group.add(label);

      const sign = { position: plan.position, label };
      this.signs.push(sign);

      const cell = this.cellKey(plan.position.x, plan.position.z);
      let bucket = this.cells.get(cell);
      if (!bucket) {
        bucket = [];
        this.cells.set(cell, bucket);
      }
      bucket.push(sign);
    }
  }

  private buildDirectionArrows(): void {
    const plans = filterArrowsByJunctions(
      planDirectionArrows(this.track),
      this.junctions,
      this.junctionGrid,
    );
    for (const plan of plans) {
      const mesh = makeArrowMesh();
      if (!mesh) continue;

      mesh.rotation.set(-Math.PI / 2, 0, directionArrowRotationY(plan.phi));
      mesh.position.set(plan.x, SIGN_HEIGHT, plan.z);
      mesh.scale.setScalar(DIRECTION_ARROW_SCALE);
      mesh.visible = false;
      this.group.add(mesh);

      const entry = { mesh, position: { x: plan.x, z: plan.z } };
      this.arrowMeshes.push(entry);

      const cell = this.cellKey(plan.x, plan.z);
      let bucket = this.arrowCells.get(cell);
      if (!bucket) {
        bucket = [];
        this.arrowCells.set(cell, bucket);
      }
      bucket.push(entry);
    }
  }

  private buildBarriers(): void {
    const geometry = this.own(
      new THREE.BoxGeometry(1, BARRIER_HEIGHT, BARRIER_DEPTH),
    );
    const material = this.own(
      new THREE.MeshLambertMaterial({ color: BARRIER_COLOR }),
    );
    for (const plan of planBarriers(this.track)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.x = plan.length;
      mesh.position.set(plan.x, BARRIER_HEIGHT / 2, plan.z);
      mesh.rotation.y = barrierRotationY(plan.ux, plan.uz);
      mesh.visible = false;
      this.group.add(mesh);

      const entry = { mesh, position: { x: plan.x, z: plan.z } };
      this.barrierMeshes.push(entry);

      const cell = this.cellKey(plan.x, plan.z);
      let bucket = this.barrierCells.get(cell);
      if (!bucket) {
        bucket = [];
        this.barrierCells.set(cell, bucket);
      }
      bucket.push(entry);
    }
  }

  updateLabels(carX: number, carZ: number): void {
    const radiusSq = LABEL_RADIUS * LABEL_RADIUS;

    const cx = Math.floor(carX / LABEL_CELL);
    const cz = Math.floor(carZ / LABEL_CELL);
    const reach = Math.ceil(LABEL_RADIUS / LABEL_CELL);

    const window = new Set<number>();
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        window.add(this.cellKey(
          (cx + dx) * LABEL_CELL,
          (cz + dz) * LABEL_CELL,
        ));
      }
    }

    for (const cell of this.lastWindow) {
      if (!window.has(cell)) {
        const bucket = this.cells.get(cell);
        if (bucket) {
          for (const sign of bucket) {
            sign.label.visible = false;
          }
        }
      }
    }
    for (const cell of this.lastArrowWindow) {
      if (!window.has(cell)) {
        const bucket = this.arrowCells.get(cell);
        if (bucket) {
          for (const entry of bucket) {
            entry.mesh.visible = false;
          }
        }
      }
    }
    for (const cell of this.lastBarrierWindow) {
      if (!window.has(cell)) {
        const bucket = this.barrierCells.get(cell);
        if (bucket) {
          for (const entry of bucket) {
            entry.mesh.visible = false;
          }
        }
      }
    }

    for (const cell of window) {
      const bucket = this.cells.get(cell);
      if (bucket) {
        for (const sign of bucket) {
          const ddx = sign.position.x - carX;
          const ddz = sign.position.z - carZ;
          const near = ddx * ddx + ddz * ddz <= radiusSq;
          sign.label.visible = near;
        }
      }

      const arrowBucket = this.arrowCells.get(cell);
      if (arrowBucket) {
        for (const entry of arrowBucket) {
          const ddx = entry.position.x - carX;
          const ddz = entry.position.z - carZ;
          const near = ddx * ddx + ddz * ddz <= radiusSq;
          entry.mesh.visible = near;
        }
      }

      const barrierBucket = this.barrierCells.get(cell);
      if (barrierBucket) {
        for (const entry of barrierBucket) {
          const ddx = entry.position.x - carX;
          const ddz = entry.position.z - carZ;
          const near = ddx * ddx + ddz * ddz <= radiusSq;
          entry.mesh.visible = near;
        }
      }
    }

    this.lastWindow.clear();
    for (const cell of window) {
      this.lastWindow.add(cell);
    }
    this.lastArrowWindow.clear();
    for (const cell of window) {
      this.lastArrowWindow.add(cell);
    }
    this.lastBarrierWindow.clear();
    for (const cell of window) {
      this.lastBarrierWindow.add(cell);
    }
  }

  private cellKey(x: number, z: number): number {
    const cx = Math.floor(x / LABEL_CELL);
    const cz = Math.floor(z / LABEL_CELL);
    return cx * 73856093 ^ cz * 19349663;
  }

  private groupByClass(): Map<RoadClass, PolylineRoad[]> {
    const map = new Map<RoadClass, PolylineRoad[]>();
    for (const road of this.track.roads) {
      const cls = roadClass(road.type);
      let list = map.get(cls);
      if (!list) {
        list = [];
        map.set(cls, list);
      }
      list.push(road);
    }
    return map;
  }

  private buildRoadBatch(roads: PolylineRoad[]): {
    geometry: THREE.BufferGeometry;
    kerb: { positions: number[]; indices: number[] };
    sidewalk: { positions: number[]; uvs: number[]; indices: number[] };
  } {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const markingStyles: number[] = [];
    const markingAcross: number[] = [];
    const markingWidths: number[] = [];
    const markingLanes: number[] = [];
    const markingPrevS: number[] = [];
    const markingPrevA: number[] = [];
    const markingNextS: number[] = [];
    const markingNextA: number[] = [];
    const kerbPositions: number[] = [];
    const kerbIndices: number[] = [];
    const sidewalkPositions: number[] = [];
    const sidewalkUVs: number[] = [];
    const sidewalkIndices: number[] = [];

    for (const road of roads) {
      this.buildRoadStrip(
        road,
        positions,
        uvs,
        indices,
        markingStyles,
        markingAcross,
        markingWidths,
        markingLanes,
        markingPrevS,
        markingPrevA,
        markingNextS,
        markingNextA,
        kerbPositions,
        kerbIndices,
        sidewalkPositions,
        sidewalkUVs,
        sidewalkIndices,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(uvs, 2),
    );
    geometry.setAttribute(
      'aMarkingStyle',
      new THREE.Float32BufferAttribute(markingStyles, 1),
    );
    geometry.setAttribute(
      'aMarkingAcross',
      new THREE.Float32BufferAttribute(markingAcross, 1),
    );
    geometry.setAttribute(
      'aMarkingWidth',
      new THREE.Float32BufferAttribute(markingWidths, 1),
    );
    geometry.setAttribute(
      'aMarkingLanes',
      new THREE.Float32BufferAttribute(markingLanes, 1),
    );
    geometry.setAttribute(
      'aMarkingPrevS',
      new THREE.Float32BufferAttribute(markingPrevS, 1),
    );
    geometry.setAttribute(
      'aMarkingPrevA',
      new THREE.Float32BufferAttribute(markingPrevA, 1),
    );
    geometry.setAttribute(
      'aMarkingNextS',
      new THREE.Float32BufferAttribute(markingNextS, 1),
    );
    geometry.setAttribute(
      'aMarkingNextA',
      new THREE.Float32BufferAttribute(markingNextA, 1),
    );
    const vertexCount = positions.length / 3;
    const normals = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      normals[i * 3 + 1] = 1;
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return {
      geometry,
      kerb: { positions: kerbPositions, indices: kerbIndices },
      sidewalk: { positions: sidewalkPositions, uvs: sidewalkUVs, indices: sidewalkIndices },
    };
  }

  private buildRoadStrip(
    road: PolylineRoad,
    positions: number[],
    uvs: number[],
    indices: number[],
    markingStyles: number[],
    markingAcross: number[],
    markingWidths: number[],
    markingLanes: number[],
    markingPrevS: number[],
    markingPrevA: number[],
    markingNextS: number[],
    markingNextA: number[],
    kerbPositions: number[],
    kerbIndices: number[],
    sidewalkPositions: number[],
    sidewalkUVs: number[],
    sidewalkIndices: number[],
  ): void {
    const { points, width } = road;
    if (points.length < 2) {
      return;
    }

    const hw = width / 2;
    const cls = roadClass(road.type);
    const dists = cumulativeDistances(points);
    const style = markingStyleValue(markingPattern(road));
    const lanes = Math.max(road.lanes, 1);
    const edge = computeEdgeStrip(points, hw);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const fadeJunctions = this.junctionGrid.nearBBox(
      minX - this.nearMargin,
      maxX + this.nearMargin,
      minZ - this.nearMargin,
      maxZ + this.nearMargin,
    );
    const total = dists[dists.length - 1];
    const fades: { s: number; allowance: number }[] = [];
    for (const j of fadeJunctions) {
      const { along, lateral } = projectOntoRoad(points, j.position);
      const allowance = j.radius + 2;
      if (
        along >= -allowance &&
        along <= total + allowance &&
        lateral <= hw + j.radius
      ) {
        fades.push({ s: along, allowance });
      }
    }
    fades.sort((a, b) => a.s - b.s);

    const farPrev = { s: -1e6, allowance: -1e6 };
    const farNext = { s: 1e6, allowance: -1e6 };

    let fidx = 0;
    for (let i = 0; i < edge.left.length - 1; i++) {
      while (fidx < fades.length && fades[fidx].s <= dists[i]) fidx++;
      let nidx = fidx;
      while (nidx < fades.length && fades[nidx].s < dists[i + 1]) nidx++;

      // Junctions that project inside this segment split it, so every piece
      // fades towards the junctions directly before and after it.
      const breaks = [dists[i], ...fades.slice(fidx, nidx).map((f) => f.s), dists[i + 1]];
      const segLen = dists[i + 1] - dists[i];
      for (let k = 0; k < breaks.length - 1; k++) {
        const s0 = breaks[k];
        const s1 = breaks[k + 1];
        if (s1 - s0 < 1e-6 && breaks.length > 2) continue;
        const prev = fidx + k > 0 ? fades[fidx + k - 1] : farPrev;
        const next = fidx + k < fades.length ? fades[fidx + k] : farNext;
        const t0 = segLen > 0 ? (s0 - dists[i]) / segLen : 0;
        const t1 = segLen > 0 ? (s1 - dists[i]) / segLen : 1;
        const l0 = lerpVec(edge.left[i], edge.left[i + 1], t0);
        const r0 = lerpVec(edge.right[i], edge.right[i + 1], t0);
        const l1 = lerpVec(edge.left[i], edge.left[i + 1], t1);
        const r1 = lerpVec(edge.right[i], edge.right[i + 1], t1);

        const base = positions.length / 3;
        positions.push(
          l0.x, ROAD_HEIGHT, l0.z,
          r0.x, ROAD_HEIGHT, r0.z,
          l1.x, ROAD_HEIGHT, l1.z,
          r1.x, ROAD_HEIGHT, r1.z,
        );

        uvs.push(
          metresToUv(-hw), metresToUv(s0),
          metresToUv(hw), metresToUv(s0),
          metresToUv(-hw), metresToUv(s1),
          metresToUv(hw), metresToUv(s1),
        );

        markingPrevS.push(prev.s, prev.s, prev.s, prev.s);
        markingPrevA.push(prev.allowance, prev.allowance, prev.allowance, prev.allowance);
        markingNextS.push(next.s, next.s, next.s, next.s);
        markingNextA.push(next.allowance, next.allowance, next.allowance, next.allowance);
        markingStyles.push(style, style, style, style);
        markingAcross.push(-hw, hw, -hw, hw);
        markingWidths.push(width, width, width, width);
        markingLanes.push(lanes, lanes, lanes, lanes);

        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
      }
    }

    const cuts = this.sidewalkCuts.get(road) ?? [];
    const length = total;
    const walk = cls === 'service' || cls === 'shared' ? 0 : sidewalkWidth(width);

    for (const side of SIDES) {
      for (const [start, end] of keptSpans(length, cuts, side)) {
        const span = subPolyline(points, dists, start, end);
        const spanEdge = computeEdgeStrip(span.points, hw);
        if (walk > 0) {
          emitSidewalkSpan(
            spanEdge,
            span.dists,
            side,
            walk,
            kerbPositions,
            kerbIndices,
            sidewalkPositions,
            sidewalkUVs,
            sidewalkIndices,
          );
        } else {
          emitKerbDropSpan(spanEdge, side, kerbPositions, kerbIndices);
        }
      }
    }
  }

  dispose(): void {
    this.signs.length = 0;
    this.arrowMeshes.length = 0;
    this.arrowCells.clear();
    this.cells.clear();
    this.barrierMeshes.length = 0;
    this.barrierCells.clear();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
  }
}
