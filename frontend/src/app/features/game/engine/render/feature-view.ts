import * as THREE from 'three';
import { MapItemKind } from '../sim/osm-types';
import { PropPart, PropSpec, PropVariant } from '../sim/prop-spec';
import { PolylineRoad, TrackData } from '../sim/track';
import { ROAD_HEIGHT, SURFACE_OFFSET } from './constants';
import { PartInstance, PropPool } from './prop-pool';

const MARKER_CELL = 600;
const MARKER_RADIUS = 600;

const LIGHT_SEARCH_RADIUS = 12;
const LIGHT_SIDE_MARGIN = 1.5;
const MAX_APPROACHES = 6;
const LIGHT_LOCAL_RADIUS = 45;
const LIGHT_SETBACKS = [4, 6, 8, 10, 12];
const LIGHT_KERB_CLEARANCE = 0.5;
const OVERHEAD_SETBACK = 6;

const BUS_STOP_CENTER_TOLERANCE = 1;
const BUS_STOP_SIDE_MARGIN = 1.5;

const CROSSING_SEARCH_RADIUS = 6;
const CROSSING_TANGENT_PROBE = 5;
const CROSSING_PROBE_TOLERANCE = 2;

const STRIPE_PITCH = 0.9;
const STRIPE_KERB_MARGIN = 0.6;
const STRIPE_MIN_COUNT = 2;
const STRIPE_MAX_COUNT = 16;
const DEFAULT_CROSSING_WIDTH = 6;

export type SignalMount = 'pole' | 'overhead';

export interface TrafficLightApproach {
  x: number;
  z: number;
  faceYaw: number;
  mount: SignalMount;
}

interface CrossingAlignment {
  rotation: number;
  width: number;
}

export interface BusStopPlacement {
  x: number;
  z: number;
  faceYaw: number;
}

export function placeBusStop(
  x: number,
  z: number,
  roads: PolylineRoad[],
): BusStopPlacement {
  let best: {
    distance: number;
    cross: number;
    tx: number;
    tz: number;
    cx: number;
    cz: number;
    width: number;
  } | null = null;

  for (const road of roads) {
    const points = road.points;
    if (points.length < 2) continue;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const lenSq = sx * sx + sz * sz;
      if (lenSq < 1e-12) continue;
      let t = ((x - a.x) * sx + (z - a.z) * sz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + sx * t;
      const cz = a.z + sz * t;
      const distance = Math.hypot(x - cx, z - cz);
      if (!best || distance < best.distance) {
        const len = Math.sqrt(lenSq);
        best = {
          distance,
          cross: (sx / len) * (z - a.z) - (sz / len) * (x - a.x),
          tx: sx / len,
          tz: sz / len,
          cx,
          cz,
          width: road.width,
        };
      }
    }
  }

  if (!best) {
    return { x, z, faceYaw: 0 };
  }

  let px = x;
  let pz = z;
  if (Math.abs(best.cross) < BUS_STOP_CENTER_TOLERANCE) {
    const sideX = -best.tz;
    const sideZ = best.tx;
    const offset = best.width / 2 + BUS_STOP_SIDE_MARGIN;
    px = x + sideX * offset;
    pz = z + sideZ * offset;
  }

  return {
    x: px,
    z: pz,
    faceYaw: Math.atan2(best.cx - px, best.cz - pz),
  };
}

function pointSegmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const sx = bx - ax;
  const sz = bz - az;
  const lenSq = sx * sx + sz * sz;
  if (lenSq < 1e-12) {
    return Math.hypot(x - ax, z - az);
  }
  let t = ((x - ax) * sx + (z - az) * sz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + sx * t), z - (az + sz * t));
}

function roadDistance(x: number, z: number, road: PolylineRoad): number {
  let best = Infinity;
  const points = road.points;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = pointSegmentDistance(x, z, a.x, a.z, b.x, b.z);
    if (d < best) best = d;
  }
  return best;
}

interface ApproachDirection {
  tx: number;
  tz: number;
  flow: 1 | -1;
}

interface CircleCrossing {
  t: number;
  flow: 1 | -1;
}

function circleCrossings(
  px: number,
  pz: number,
  radius: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): CircleCrossing[] {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - px;
  const fz = az - pz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return [];
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sqrtDisc = Math.sqrt(disc);
  const out: CircleCrossing[] = [];
  for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
    if (t < 0 || t > 1) continue;
    const tBefore = Math.max(t - 1e-3, 0);
    const tAfter = Math.min(t + 1e-3, 1);
    const dBefore = Math.hypot(px - (ax + dx * tBefore), pz - (az + dz * tBefore));
    const dAfter = Math.hypot(px - (ax + dx * tAfter), pz - (az + dz * tAfter));
    if (dBefore > radius - 1e-9 && dAfter <= radius + 1e-9) {
      out.push({ t, flow: 1 });
    } else if (dBefore <= radius + 1e-9 && dAfter > radius - 1e-9) {
      out.push({ t, flow: -1 });
    }
  }
  return out;
}

function approachDirections(
  x: number,
  z: number,
  road: PolylineRoad,
  radius: number,
): ApproachDirection[] {
  const points = road.points;
  const out: ApproachDirection[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const crossing of circleCrossings(x, z, radius, a.x, a.z, b.x, b.z)) {
      const cx = a.x + (b.x - a.x) * crossing.t;
      const cz = a.z + (b.z - a.z) * crossing.t;
      const dx = x - cx;
      const dz = z - cz;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      out.push({ tx: dx / len, tz: dz / len, flow: crossing.flow });
    }
  }
  return out;
}

function roadPenetration(
  x: number,
  z: number,
  roads: PolylineRoad[],
): number {
  let worst = -Infinity;
  for (const road of roads) {
    const depth = road.width / 2 - roadDistance(x, z, road);
    if (depth > worst) worst = depth;
  }
  return worst;
}

export function planTrafficLightApproaches(
  x: number,
  z: number,
  roads: PolylineRoad[],
): TrafficLightApproach[] {
  const plans: TrafficLightApproach[] = [];
  const seen = new Set<string>();

  const local = roads.filter(
    (road) =>
      road.points.length >= 2 &&
      roadDistance(x, z, road) <= LIGHT_LOCAL_RADIUS,
  );

  for (const road of local) {
    for (const d of approachDirections(x, z, road, LIGHT_SEARCH_RADIUS)) {
      if (road.oneway !== 0 && d.flow !== road.oneway) continue;

      const key = `${d.tx.toFixed(2)},${d.tz.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rightX = -d.tz;
      const rightZ = d.tx;
      const margin = road.width / 2 + LIGHT_SIDE_MARGIN;

      let faceYaw = Math.atan2(d.tx, d.tz) + Math.PI;
      if (faceYaw > Math.PI) faceYaw -= 2 * Math.PI;

      let placed: TrafficLightApproach | null = null;
      for (const setback of LIGHT_SETBACKS) {
        const px = x - d.tx * setback + rightX * margin;
        const pz = z - d.tz * setback + rightZ * margin;
        if (roadPenetration(px, pz, local) <= -LIGHT_KERB_CLEARANCE) {
          placed = { x: px, z: pz, faceYaw, mount: 'pole' };
          break;
        }
      }

      plans.push(
        placed ?? {
          x: x - d.tx * OVERHEAD_SETBACK,
          z: z - d.tz * OVERHEAD_SETBACK,
          faceYaw,
          mount: 'overhead',
        },
      );
    }
  }

  if (plans.length === 0) {
    return [{ x, z, faceYaw: 0, mount: 'overhead' }];
  }
  return plans;
}

export function crossingStripeCount(width: number): number {
  const usable = width - 2 * STRIPE_KERB_MARGIN;
  const count = Math.round(usable / STRIPE_PITCH);
  return Math.max(STRIPE_MIN_COUNT, Math.min(STRIPE_MAX_COUNT, count));
}

export function crossingStripeRotation(
  x: number,
  z: number,
  roads: PolylineRoad[],
): CrossingAlignment {
  let best: CrossingAlignment & { distance: number; good: boolean } | null = null;

  for (const road of roads) {
    const points = road.points;
    if (points.length < 2) continue;

    let distance = Infinity;
    let tangent = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const d = pointSegmentDistance(x, z, a.x, a.z, b.x, b.z);
      if (d < distance) {
        distance = d;
        tangent = Math.atan2(b.z - a.z, b.x - a.x);
      }
    }

    if (distance > CROSSING_SEARCH_RADIUS) continue;

    const tangentX = Math.cos(tangent);
    const tangentZ = Math.sin(tangent);
    const alongA = roadDistance(
      x + tangentX * CROSSING_TANGENT_PROBE,
      z + tangentZ * CROSSING_TANGENT_PROBE,
      road,
    );
    const alongB = roadDistance(
      x - tangentX * CROSSING_TANGENT_PROBE,
      z - tangentZ * CROSSING_TANGENT_PROBE,
      road,
    );
    const good =
      alongA <= CROSSING_PROBE_TOLERANCE &&
      alongB <= CROSSING_PROBE_TOLERANCE;

    if (
      !best ||
      (good && (!best.good || distance < best.distance)) ||
      (!good && !best.good && distance < best.distance)
    ) {
      best = {
        rotation: -tangent,
        width: road.width,
        distance,
        good,
      };
    }
  }

  return best
    ? { rotation: best.rotation, width: best.width }
    : { rotation: 0, width: DEFAULT_CROSSING_WIDTH };
}

export interface Placement {
  kind: MapItemKind;
  variant: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scaleX: number;
  scaleZ: number;
}

export interface BuiltPropPool {
  key: string;
  name: string;
  kind: MapItemKind;
  capacity: number;
  mesh: THREE.InstancedMesh;
}

interface RawAtom {
  placementIndex: number;
  key: string;
  part: PropPart;
  markerMatrix: THREE.Matrix4;
  localMatrix: THREE.Matrix4;
}

interface PoolEntry {
  placementIndex: number;
  matrix: THREE.Matrix4;
}

interface BuiltPool extends BuiltPropPool {
  pool: PropPool;
  entries: PoolEntry[];
}

interface MarkerRecord {
  group: THREE.Group;
  x: number;
  z: number;
}

function partKey(part: PropPart): string {
  return `${part.name}|${part.size.join(',')}|${part.color}|${part.emissive ?? ''}|${part.renderOrder ?? ''}|${part.castShadow ?? ''}`;
}

export function footprintScale(
  size: number | undefined,
  base: number,
): number {
  if (size === undefined) return 1;
  return Math.max(size / base, 1);
}

function specFor(props: PropSpec[], kind: MapItemKind): PropSpec | undefined {
  return props.find((p) => p.kind === kind);
}

function variantFor(
  spec: PropSpec,
  id: string,
): PropVariant | undefined {
  return spec.variants.find((v) => v.id === id);
}

function composeMarkerMatrix(
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleZ: number,
): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeScale(scaleX, 1, scaleZ));
}

function cellKeyAt(cx: number, cz: number): number {
  return cx * 73856093 ^ cz * 19349663;
}

function cellKey(x: number, z: number): number {
  return cellKeyAt(Math.floor(x / MARKER_CELL), Math.floor(z / MARKER_CELL));
}

export class FeatureView {
  readonly group = new THREE.Group();

  readonly placements: Placement[] = [];
  private readonly _pools: BuiltPool[] = [];

  get pools(): BuiltPropPool[] {
    return this._pools;
  }

  get modelGroups(): THREE.Group[] {
    return this.modelRecords.map((record) => record.group);
  }

  private readonly cells = new Map<number, number[]>();
  private flags = new Uint8Array(0);
  private readonly windowScratch: number[] = [];
  private windowCount = 0;
  private lastCell = NaN;
  private readonly modelRecords: MarkerRecord[] = [];

  constructor(
    private readonly track: TrackData,
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group> = new Map(),
  ) {
    this.build(props, models);
  }

  private build(
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group>,
  ): void {
    const raw = new Map<string, RawAtom[]>();

    for (const light of this.track.features.trafficLights) {
      this.handleTrafficLight(light.position.x, light.position.z, props, models, raw);
    }
    for (const crossing of this.track.features.pedestrianCrossings) {
      this.handleCrossing(crossing.position.x, crossing.position.z, props, models, raw);
    }
    for (const stop of this.track.features.publicTransportStops) {
      this.handleBusStop(stop.position.x, stop.position.z, stop.width, stop.depth, props, models, raw);
    }
    for (const kind of ['gasStation', 'fireStation', 'hospital', 'policeStation'] as const) {
      const key: 'gasStations' | 'fireStations' | 'hospitals' | 'policeStations' =
        `${kind}s` as const;
      for (const station of this.track.features[key]) {
        this.handleStation(
          kind,
          station.position.x,
          station.position.z,
          station.width,
          station.depth,
          props,
          models,
          raw,
        );
      }
    }

    for (const [key, atoms] of raw) {
      const first = atoms[0].part;
      const pool = new PropPool(
        new THREE.BoxGeometry(first.size[0], first.size[1], first.size[2]),
        new THREE.MeshLambertMaterial({
          color: first.color,
          ...(first.emissive !== undefined ? { emissive: first.emissive } : {}),
        }),
        atoms.length,
      );
      pool.mesh.name = key;
      pool.mesh.renderOrder = first.renderOrder ?? 0;
      pool.mesh.castShadow = first.castShadow ?? false;
      if (this.placements[atoms[0].placementIndex].kind === 'pedestrianCrossing') {
        const material = pool.mesh.material as THREE.Material;
        material.polygonOffset = true;
        material.polygonOffsetFactor = SURFACE_OFFSET.decal;
        material.polygonOffsetUnits = SURFACE_OFFSET.decal;
      }

      const entries = atoms.map((atom) => ({
        placementIndex: atom.placementIndex,
        matrix: atom.markerMatrix.clone().multiply(atom.localMatrix),
      }));

      const built: BuiltPool = {
        key,
        name: first.name,
        kind: this.placements[atoms[0].placementIndex].kind,
        capacity: atoms.length,
        mesh: pool.mesh,
        pool,
        entries,
      };
      this._pools.push(built);
      this.group.add(pool.mesh);
    }

    this.flags = new Uint8Array(this.placements.length);
    this.windowScratch.length = this.placements.length;
    for (const built of this._pools) {
      built.mesh.count = 0;
      built.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addPlacement(placement: Placement): number {
    const index = this.placements.length;
    this.placements.push(placement);

    const bucket = this.cells.get(cellKey(placement.x, placement.z));
    if (bucket) {
      bucket.push(index);
    } else {
      this.cells.set(cellKey(placement.x, placement.z), [index]);
    }
    return index;
  }

  private emitPart(
    raw: Map<string, RawAtom[]>,
    placementIndex: number,
    markerMatrix: THREE.Matrix4,
    part: PropPart,
    offset: [number, number, number] = [0, 0, 0],
  ): void {
    const key = partKey(part);
    const localMatrix = new THREE.Matrix4().makeTranslation(
      part.position[0] + offset[0],
      part.position[1] + offset[1],
      part.position[2] + offset[2],
    );
    let bucket = raw.get(key);
    if (!bucket) {
      bucket = [];
      raw.set(key, bucket);
    }
    bucket.push({ placementIndex, key, part, markerMatrix, localMatrix });
  }

  private emitVariant(
    raw: Map<string, RawAtom[]>,
    placementIndex: number,
    markerMatrix: THREE.Matrix4,
    variant: PropVariant,
  ): void {
    for (const part of variant.parts) {
      this.emitPart(raw, placementIndex, markerMatrix, part);
    }
  }

  private placeModel(
    models: ReadonlyMap<MapItemKind, THREE.Group>,
    kind: MapItemKind,
    placement: Placement,
  ): void {
    const source = models.get(kind);
    if (!source) return;
    const holder = new THREE.Group();
    holder.position.set(placement.x, placement.y, placement.z);
    holder.rotation.y = placement.yaw;
    holder.add(source.clone());
    holder.visible = false;
    this.modelRecords.push({ group: holder, x: placement.x, z: placement.z });
    this.group.add(holder);
  }

  private handleTrafficLight(
    x: number,
    z: number,
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group>,
    raw: Map<string, RawAtom[]>,
  ): void {
    const spec = specFor(props, 'trafficLight');
    if (!spec) return;
    const useModel = models.has('trafficLight');
    const plans = planTrafficLightApproaches(x, z, this.track.roads);
    for (const plan of plans.slice(0, MAX_APPROACHES)) {
      const placement: Placement = {
        kind: 'trafficLight',
        variant: plan.mount,
        x: plan.x,
        y: 0,
        z: plan.z,
        yaw: plan.faceYaw,
        scaleX: 1,
        scaleZ: 1,
      };
      const index = this.addPlacement(placement);
      if (useModel) {
        this.placeModel(models, 'trafficLight', placement);
        continue;
      }
      const variant = variantFor(spec, plan.mount);
      if (!variant) continue;
      const marker = composeMarkerMatrix(plan.x, 0, plan.z, plan.faceYaw, 1, 1);
      this.emitVariant(raw, index, marker, variant);
    }
  }

  private handleCrossing(
    x: number,
    z: number,
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group>,
    raw: Map<string, RawAtom[]>,
  ): void {
    const spec = specFor(props, 'pedestrianCrossing');
    if (!spec) return;
    const variant = variantFor(spec, 'default');
    const stripePart = variant?.parts.find((p) => p.name === 'stripe');
    if (!variant || !stripePart) return;

    const useModel = models.has('pedestrianCrossing');
    const alignment = crossingStripeRotation(x, z, this.track.roads);
    const stripeHeight = stripePart.size[1];
    const placement: Placement = {
      kind: 'pedestrianCrossing',
      variant: 'default',
      x,
      y: ROAD_HEIGHT + stripeHeight / 2,
      z,
      yaw: alignment.rotation,
      scaleX: 1,
      scaleZ: 1,
    };
    const index = this.addPlacement(placement);
    if (useModel) {
      this.placeModel(models, 'pedestrianCrossing', placement);
      return;
    }

    const marker = composeMarkerMatrix(
      x,
      ROAD_HEIGHT + stripeHeight / 2,
      z,
      alignment.rotation,
      1,
      1,
    );
    const count = crossingStripeCount(alignment.width);
    const half = (count - 1) / 2;
    const part = variant.parts[0];
    for (let i = 0; i < count; i++) {
      this.emitPart(raw, index, marker, part, [0, 0, (i - half) * STRIPE_PITCH]);
    }
  }

  private handleBusStop(
    x: number,
    z: number,
    width: number | undefined,
    depth: number | undefined,
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group>,
    raw: Map<string, RawAtom[]>,
  ): void {
    const spec = specFor(props, 'busStop');
    if (!spec) return;
    const placement = placeBusStop(x, z, this.track.roads);
    const base = spec.footprint ?? { width: 1.7, depth: 1.0 };
    const scaleX = footprintScale(width, base.width);
    const scaleZ = footprintScale(depth, base.depth);
    const placed: Placement = {
      kind: 'busStop',
      variant: 'default',
      x: placement.x,
      y: 0,
      z: placement.z,
      yaw: placement.faceYaw,
      scaleX,
      scaleZ,
    };
    const index = this.addPlacement(placed);
    if (models.has('busStop')) {
      this.placeModel(models, 'busStop', placed);
      return;
    }
    const variant = variantFor(spec, 'default');
    if (!variant) return;
    const marker = composeMarkerMatrix(placement.x, 0, placement.z, placement.faceYaw, scaleX, scaleZ);
    this.emitVariant(raw, index, marker, variant);
  }

  private handleStation(
    kind: 'gasStation' | 'fireStation' | 'hospital' | 'policeStation',
    x: number,
    z: number,
    width: number | undefined,
    depth: number | undefined,
    props: PropSpec[],
    models: ReadonlyMap<MapItemKind, THREE.Group>,
    raw: Map<string, RawAtom[]>,
  ): void {
    const spec = specFor(props, kind);
    if (!spec) return;
    const base = spec.footprint ?? { width: 10, depth: 8 };
    const scaleX = footprintScale(width, base.width);
    const scaleZ = footprintScale(depth, base.depth);
    const placement: Placement = {
      kind,
      variant: 'default',
      x,
      y: 0,
      z,
      yaw: 0,
      scaleX,
      scaleZ,
    };
    const index = this.addPlacement(placement);
    if (models.has(kind)) {
      this.placeModel(models, kind, placement);
      return;
    }
    const variant = variantFor(spec, 'default');
    if (!variant) return;
    const marker = composeMarkerMatrix(x, 0, z, 0, scaleX, scaleZ);
    this.emitVariant(raw, index, marker, variant);
  }

  update(carX: number, carZ: number): void {
    const cell = cellKey(carX, carZ);
    const radiusSq = MARKER_RADIUS * MARKER_RADIUS;
    const cellChanged = cell !== this.lastCell;
    if (cellChanged) {
      this.flags.fill(0);
      this.rebuildWindow(carX, carZ);
      this.lastCell = cell;
    }

    let changed = cellChanged;
    for (let i = 0; i < this.windowCount; i++) {
      const index = this.windowScratch[i];
      const placement = this.placements[index];
      const dx = placement.x - carX;
      const dz = placement.z - carZ;
      const visible = dx * dx + dz * dz <= radiusSq ? 1 : 0;
      if (this.flags[index] !== visible) {
        this.flags[index] = visible;
        changed = true;
      }
    }
    if (changed) {
      for (const built of this._pools) {
        this.rebuildPool(built);
      }
    }

    for (const record of this.modelRecords) {
      const dx = record.x - carX;
      const dz = record.z - carZ;
      record.group.visible = dx * dx + dz * dz <= radiusSq;
    }
  }

  private rebuildWindow(carX: number, carZ: number): void {
    const cx = Math.floor(carX / MARKER_CELL);
    const cz = Math.floor(carZ / MARKER_CELL);
    const reach = Math.ceil(MARKER_RADIUS / MARKER_CELL);
    this.windowCount = 0;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const bucket = this.cells.get(cellKeyAt(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const index of bucket) {
          this.windowScratch[this.windowCount++] = index;
        }
      }
    }
  }

  private rebuildPool(built: BuiltPool): void {
    const visible: PartInstance[] = [];
    for (const entry of built.entries) {
      if (this.flags[entry.placementIndex] === 1) {
        visible.push(entry);
      }
    }
    built.pool.write(visible);
  }

  dispose(): void {
    for (const built of this._pools) {
      built.pool.dispose();
    }
    this._pools.length = 0;
    this.placements.length = 0;
    this.cells.clear();
    this.windowCount = 0;
    this.modelRecords.length = 0;
  }
}