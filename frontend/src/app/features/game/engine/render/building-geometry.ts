import * as THREE from 'three';
import { Building, FLOOR_HEIGHT } from '../sim/buildings';
import { Vec2 } from '../sim/types';

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  buildingIds: number[];
}

export const WALL_TILE_METRES = 8;
export const ROOF_TILE_METRES = 4;

export const PLINTH_REACH = 0.5;
export const PLINTH_OFFSET = 0.15;
export const CORNICE_HEIGHT = 0.6;
export const CORNICE_OFFSET = 0.3;
export const EAVES_OFFSET = 0.4;
export const AO_HEIGHT = 1.5;
export const AO_STRENGTH = 0.22;
export const NORTH_DARKEN = 0.08;

export function emptyMeshArrays(): MeshArrays {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [], buildingIds: [] };
}

export function inflateRing(ring: readonly Vec2[], distance: number): Vec2[] {
  const n = ring.length;
  return ring.map((p, i) => {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    const e1x = p.x - prev.x;
    const e1z = p.z - prev.z;
    const e2x = next.x - p.x;
    const e2z = next.z - p.z;
    const l1 = Math.hypot(e1x, e1z) || 1;
    const l2 = Math.hypot(e2x, e2z) || 1;
    const n1x = e1z / l1;
    const n1z = -e1x / l1;
    const n2x = e2z / l2;
    const n2z = -e2x / l2;
    const bx = n1x + n2x;
    const bz = n1z + n2z;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) {
      return { x: p.x + n1x * distance, z: p.z + n1z * distance };
    }
    const denom = Math.max(0.6, 1 + (n1x * n2x + n1z * n2z));
    const scale = distance / denom;
    return { x: p.x + bx * scale, z: p.z + bz * scale };
  });
}

interface Edge {
  a: Vec2;
  b: Vec2;
  nx: number;
  nz: number;
  len: number;
}

function ringEdges(ring: readonly Vec2[]): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    out.push({ a, b, nx: dz / len, nz: -dx / len, len });
  }
  return out;
}

function pushQuad(
  target: MeshArrays,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
  nx: number,
  ny: number,
  nz: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  tint0: THREE.Color,
  tint1: THREE.Color,
  buildingId: number,
): void {
  const base = target.positions.length / 3;
  const vertices: Array<[number, number, number, number, number, THREE.Color]> = [
    [ax, ay, az, u0, v0, tint0],
    [bx, by, bz, u1, v0, tint0],
    [cx, cy, cz, u0, v1, tint1],
    [dx, dy, dz, u1, v1, tint1],
  ];
  for (const [x, y, z, u, v, tint] of vertices) {
    target.positions.push(x, y, z);
    target.normals.push(nx, ny, nz);
    target.colors.push(tint.r, tint.g, tint.b);
    target.uvs.push(u, v);
    target.buildingIds.push(buildingId);
  }
  target.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function wallTint(tint: THREE.Color, y: number, nz: number): THREE.Color {
  const out = tint.clone();
  const ao = 1 - AO_STRENGTH * (1 - Math.min(y / AO_HEIGHT, 1));
  const north = nz > 0.05 ? 1 - NORTH_DARKEN : 1;
  out.multiplyScalar(ao * north);
  return out;
}

function edgeUvs(edges: Edge[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let running = 0;
  for (const edge of edges) {
    out.push([running / WALL_TILE_METRES, (running + edge.len) / WALL_TILE_METRES]);
    running += edge.len;
  }
  return out;
}

export function appendWalls(target: MeshArrays, building: Building, color: number): void {
  const tint = new THREE.Color(color);
  const top = building.height;

  const edges = ringEdges(building.points);
  const envelopeUvs = edgeUvs(edges);
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const [u0, u1] = envelopeUvs[i];
    const v0 = 0;
    const v1 = top / FLOOR_HEIGHT;

    const tintBase = wallTint(tint, 0, edge.nz);
    const tintTop = wallTint(tint, top, edge.nz);
    const base = target.positions.length / 3;
    target.positions.push(
      edge.a.x, 0, edge.a.z,
      edge.b.x, 0, edge.b.z,
      edge.a.x, top, edge.a.z,
      edge.b.x, top, edge.b.z,
    );
    for (let k = 0; k < 4; k++) {
      target.normals.push(edge.nx, 0, edge.nz);
      const atTop = k >= 2;
      target.colors.push(
        atTop ? tintTop.r : tintBase.r,
        atTop ? tintTop.g : tintBase.g,
        atTop ? tintTop.b : tintBase.b,
      );
      target.buildingIds.push(building.id);
    }
    target.uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
    target.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  const plinthRing = inflateRing(building.points, PLINTH_OFFSET);
  const plinthEdges = ringEdges(plinthRing);
  for (let i = 0; i < plinthEdges.length; i++) {
    const edge = plinthEdges[i];
    const [u0, u1] = plinthEdges.length === edges.length ? envelopeUvs[i] : edgeUvs([edge])[0];
    const v0 = 0;
    const v1 = PLINTH_REACH / FLOOR_HEIGHT;
    pushQuad(
      target,
      edge.a.x, 0, edge.a.z,
      edge.b.x, 0, edge.b.z,
      edge.a.x, PLINTH_REACH, edge.a.z,
      edge.b.x, PLINTH_REACH, edge.b.z,
      edge.nx, 0, edge.nz,
      u0, u1, v0, v1,
      wallTint(tint, 0, edge.nz),
      wallTint(tint, PLINTH_REACH, edge.nz),
      building.id,
    );
  }

  const corniceRing = inflateRing(building.points, CORNICE_OFFSET);
  const corniceEdges = ringEdges(corniceRing);
  for (let i = 0; i < corniceEdges.length; i++) {
    const edge = corniceEdges[i];
    const [u0, u1] =
      corniceEdges.length === edges.length ? envelopeUvs[i] : edgeUvs([edge])[0];
    const y0 = top - CORNICE_HEIGHT;
    const v0 = y0 / FLOOR_HEIGHT;
    const v1 = top / FLOOR_HEIGHT;
    pushQuad(
      target,
      edge.a.x, y0, edge.a.z,
      edge.b.x, y0, edge.b.z,
      edge.a.x, top, edge.a.z,
      edge.b.x, top, edge.b.z,
      edge.nx, 0, edge.nz,
      u0, u1, v0, v1,
      wallTint(tint, y0, edge.nz),
      wallTint(tint, top, edge.nz),
      building.id,
    );
  }
}

export function appendRoof(target: MeshArrays, building: Building, color: number): void {
  const tint = new THREE.Color(color);
  const top = building.height;
  const roofRing = inflateRing(building.points, EAVES_OFFSET);

  const base = target.positions.length / 3;
  for (const p of roofRing) {
    target.positions.push(p.x, top, p.z);
    target.normals.push(0, 1, 0);
    target.colors.push(tint.r, tint.g, tint.b);
    target.uvs.push(p.x / ROOF_TILE_METRES, p.z / ROOF_TILE_METRES);
    target.buildingIds.push(building.id);
  }
  const contour = roofRing.map((p) => new THREE.Vector2(p.x, p.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [a, b, c] of triangles) {
    target.indices.push(base + a, base + c, base + b);
  }
}

export function appendBuilding(target: MeshArrays, building: Building, color: number): void {
  appendWalls(target, building, color);
  appendRoof(target, building, color);
}