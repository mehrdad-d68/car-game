import * as THREE from 'three';
import { Building, FLOOR_HEIGHT } from '../sim/buildings';
import { FLOORS_PER_TILE } from './building-textures';

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  buildingIds: number[];
}

export const WALL_TILE_METRES = 12.8;
const ROOF_TILE_METRES = 6;

export function emptyMeshArrays(): MeshArrays {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [], buildingIds: [] };
}

export function appendBuilding(target: MeshArrays, building: Building, color: number): void {
  const tint = new THREE.Color(color);
  const ring = building.points;
  const top = building.height;
  const vTop = top / (FLOOR_HEIGHT * FLOORS_PER_TILE);

  let running = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const nx = dz / len;
    const nz = -dx / len;
    const u0 = running / WALL_TILE_METRES;
    const u1 = (running + len) / WALL_TILE_METRES;
    running += len;

    const base = target.positions.length / 3;
    target.positions.push(a.x, 0, a.z, b.x, 0, b.z, a.x, top, a.z, b.x, top, b.z);
    for (let k = 0; k < 4; k++) {
      target.normals.push(nx, 0, nz);
      target.colors.push(tint.r, tint.g, tint.b);
      target.buildingIds.push(building.id);
    }
    target.uvs.push(u0, 0, u1, 0, u0, vTop, u1, vTop);
    target.indices.push(base + 2, base + 1, base, base + 2, base + 3, base + 1);
  }

  const contour = ring.map((p) => new THREE.Vector2(p.x, p.z));
  const roofBase = target.positions.length / 3;
  for (const p of ring) {
    target.positions.push(p.x, top, p.z);
    target.normals.push(0, 1, 0);
    target.colors.push(tint.r, tint.g, tint.b);
    target.uvs.push(p.x / ROOF_TILE_METRES, p.z / ROOF_TILE_METRES);
    target.buildingIds.push(building.id);
  }
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (triangles.length === 0) return;
  for (const [a, b, c] of triangles) {
    target.indices.push(roofBase + a, roofBase + c, roofBase + b);
  }
}