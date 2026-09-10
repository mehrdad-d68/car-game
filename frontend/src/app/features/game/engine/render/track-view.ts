import * as THREE from 'three';
import { PolylineRoad, TrackData } from '../sim/track';
import { Vec2 } from '../sim/types';
import { ROAD_HEIGHT } from './constants';
import { makeArrowMesh, makeLabelMesh } from './text-label';

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

interface Sign {
  position: Vec2;
  label: THREE.Mesh;
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

function roadAccess(road: PolylineRoad): string {
  return (road.access ?? '').trim().toLowerCase();
}

function isPrivateRoad(road: PolylineRoad): boolean {
  return roadAccess(road) === 'private';
}

function entranceTangent(
  points: Vec2[],
  end: 'start' | 'end',
): { tangent: number; inwardX: number; inwardZ: number } {
  let nx: number;
  let nz: number;

  if (end === 'start') {
    nx = points[1].x - points[0].x;
    nz = points[1].z - points[0].z;
  } else {
    const idx = points.length - 1;
    nx = points[idx].x - points[idx - 1].x;
    nz = points[idx].z - points[idx - 1].z;
  }

  const len = Math.hypot(nx, nz) || 1;
  const tangent = Math.atan2(nz, nx);
  const inwardX = end === 'start' ? nx / len : -nx / len;
  const inwardZ = end === 'start' ? nz / len : -nz / len;

  return { tangent, inwardX, inwardZ };
}

function midpoint(points: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    z += p.z;
  }
  return { x: x / points.length, z: z / points.length };
}

export function planBarriers(track: TrackData): BarrierPlan[] {
  const plans: BarrierPlan[] = [];

  for (const road of track.roads) {
    if (!isPrivateRoad(road)) continue;
    const pts = road.points;
    if (pts.length < 2) continue;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const closed = Math.hypot(last.x - first.x, last.z - first.z) < 1e-6;

    const length = road.width * BARRIER_SCALE;
    const ends: ('start' | 'end')[] = closed ? ['start'] : ['start', 'end'];
    const anyPoint = closed ? midpoint(pts) : first;

    for (const end of ends) {
      const { tangent, inwardX, inwardZ } = entranceTangent(pts, end);
      const origin = end === 'start' ? anyPoint : last;
      const cx = origin.x + inwardX * BARRIER_RETREAT;
      const cz = origin.z + inwardZ * BARRIER_RETREAT;

      plans.push({
        x: cx,
        z: cz,
        ux: -Math.sin(tangent),
        uz: Math.cos(tangent),
        length,
      });
    }
  }

  return plans;
}

function barrierRotationY(ux: number, uz: number): number {
  return Math.atan2(-uz, ux);
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

  constructor(private readonly track: TrackData) {
    this.buildGround();
    this.buildRoads();
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
      this.own(new THREE.MeshLambertMaterial({ color: 0x4caf50 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, GROUND_HEIGHT, centerZ);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  private buildRoads(): void {
    const grouped = this.groupByWidth();

    for (const [width, roads] of grouped) {
      const geometry = this.buildRoadBatch(roads);
      const material = this.own(
        new THREE.MeshLambertMaterial({ color: 0x37474f }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.name = `roads-w${width}`;
      this.group.add(mesh);
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
    for (const plan of planDirectionArrows(this.track)) {
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
    for (const plan of planBarriers(this.track)) {
      const geometry = this.own(
        new THREE.BoxGeometry(plan.length, BARRIER_HEIGHT, BARRIER_DEPTH),
      );
      const material = this.own(
        new THREE.MeshLambertMaterial({ color: BARRIER_COLOR }),
      );
      const mesh = new THREE.Mesh(geometry, material);
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

  private groupByWidth(): Map<number, PolylineRoad[]> {
    const map = new Map<number, PolylineRoad[]>();
    for (const road of this.track.roads) {
      let list = map.get(road.width);
      if (!list) {
        list = [];
        map.set(road.width, list);
      }
      list.push(road);
    }
    return map;
  }

  private buildRoadBatch(roads: PolylineRoad[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];

    for (const road of roads) {
      this.buildRoadStrip(road, positions, indices);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const vertexCount = positions.length / 3;
    const normals = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      normals[i * 3 + 1] = 1;
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  private buildRoadStrip(
    road: PolylineRoad,
    positions: number[],
    indices: number[],
  ): void {
    const { points, width } = road;
    if (points.length < 2) {
      return;
    }

    const hw = width / 2;
    const MITER_LIMIT = 2;

    const left: Vec2[] = [];
    const right: Vec2[] = [];

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

      left.push({ x: curr.x + px * hw, z: curr.z + pz * hw });
      right.push({ x: curr.x - px * hw, z: curr.z - pz * hw });
    }

    const vertexOffset = positions.length / 3;
    for (let i = 0; i < left.length; i++) {
      positions.push(left[i].x, ROAD_HEIGHT, left[i].z);
      positions.push(right[i].x, ROAD_HEIGHT, right[i].z);
    }

    for (let i = 0; i < left.length - 1; i++) {
      const a = vertexOffset + i * 2;
      const b = vertexOffset + i * 2 + 1;
      const c = vertexOffset + (i + 1) * 2;
      const d = vertexOffset + (i + 1) * 2 + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
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
