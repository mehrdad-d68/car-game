import * as THREE from 'three';
import { PolylineRoad, TrackData } from '../sim/track';
import { Vec2 } from '../sim/types';
import { ROAD_HEIGHT } from './constants';
import { makeArrowMesh, makeLabelMesh } from './text-label';

const GROUND_HEIGHT = 0;
const SIGN_HEIGHT = ROAD_HEIGHT + 0.1;
const LABEL_RADIUS = 300;
const LABEL_CELL = 600;
const MIN_LABEL_WIDTH = 10;
const ARROW_OFFSET = 18;

interface Sign {
  road: PolylineRoad;
  position: Vec2;
  tangent: number;
  label: THREE.Mesh;
  arrow: THREE.Mesh;
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

function tangentAngle(points: Vec2[], t: number): number {
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

export class TrackView {
  readonly group = new THREE.Group();

  private readonly signs: Sign[] = [];
  private readonly cells = new Map<number, Sign[]>();
  private readonly lastWindow = new Set<number>();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly track: TrackData) {
    this.buildGround();
    this.buildRoads();
  }

  buildLabels(): void {
    this.buildSigns();
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
    for (const road of this.track.roads) {
      if (!road.name || road.points.length < 2 || road.width < MIN_LABEL_WIDTH) {
        continue;
      }

      const position = pointAlong(road.points, 0.5);
      const tangent = tangentAngle(road.points, 0.5);

      const label = makeLabelMesh(road.name, 'white');
      if (!label) continue;

      const arrow = makeArrowMesh();
      if (!arrow) continue;

      label.rotation.set(-Math.PI / 2, 0, -tangent);
      label.position.set(position.x, SIGN_HEIGHT, position.z);
      label.visible = false;
      this.group.add(label);

      const arrowX = position.x - Math.cos(tangent) * ARROW_OFFSET;
      const arrowZ = position.z - Math.sin(tangent) * ARROW_OFFSET;
      arrow.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - tangent);
      arrow.position.set(arrowX, SIGN_HEIGHT, arrowZ);
      arrow.visible = false;
      this.group.add(arrow);

      this.signs.push({ road, position, tangent, label, arrow });

      const sign = this.signs[this.signs.length - 1];
      const cell = this.cellKey(position.x, position.z);
      let bucket = this.cells.get(cell);
      if (!bucket) {
        bucket = [];
        this.cells.set(cell, bucket);
      }
      bucket.push(sign);
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
            sign.arrow.visible = false;
          }
        }
      }
    }

    for (const cell of window) {
      const bucket = this.cells.get(cell);
      if (!bucket) {
        continue;
      }
      for (const sign of bucket) {
        const ddx = sign.position.x - carX;
        const ddz = sign.position.z - carZ;
        const near = ddx * ddx + ddz * ddz <= radiusSq;
        sign.label.visible = near;
        sign.arrow.visible = near;
      }
    }

    this.lastWindow.clear();
    for (const cell of window) {
      this.lastWindow.add(cell);
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
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
  }
}
