import * as THREE from 'three';
import { createBuildings } from '../sim/buildings';
import { appendBuilding, emptyMeshArrays } from './building-geometry';

const box = (size: number, levels: number) =>
  createBuildings([
    {
      id: 1,
      type: 'house',
      name: '',
      levels,
      points: [
        { x: 0, z: 0 },
        { x: size, z: 0 },
        { x: size, z: size },
        { x: 0, z: size },
        { x: 0, z: 0 },
      ],
    },
  ])[0];

describe('appendBuilding', () => {
  it('makes four walls and a roof for a square block', () => {
    const target = emptyMeshArrays();
    appendBuilding(target, box(10, 2), 0xffffff);
    expect(target.indices.length / 3).toBe(10);
    expect(target.normals.length).toBe(target.positions.length);
    expect(target.colors.length).toBe(target.positions.length);
    expect(target.uvs.length / 2).toBe(target.positions.length / 3);
  });

  it('puts the walls on the ground and the roof at the building height', () => {
    const target = emptyMeshArrays();
    const building = box(10, 3);
    appendBuilding(target, building, 0xffffff);
    const ys: number[] = [];
    for (let i = 1; i < target.positions.length; i += 3) ys.push(target.positions[i]);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(building.height, 6);
  });

  it('shows one window row per floor', () => {
    const two = emptyMeshArrays();
    const six = emptyMeshArrays();
    appendBuilding(two, box(10, 2), 0xffffff);
    appendBuilding(six, box(10, 6), 0xffffff);
    const vRange = (m: { uvs: number[]; normals: number[] }) => {
      const vs: number[] = [];
      for (let k = 0; k < m.uvs.length / 2; k++) {
        if (m.normals[k * 3 + 1] !== 0) continue;
        vs.push(m.uvs[k * 2 + 1]);
      }
      return vs.length ? Math.max(...vs) - Math.min(...vs) : 0;
    };
    expect(vRange(six) / vRange(two)).toBeCloseTo(3, 5);
  });

  it('appends without disturbing what is already there', () => {
    const target = emptyMeshArrays();
    appendBuilding(target, box(10, 1), 0xffffff);
    const firstCount = target.indices.length;
    const firstMax = Math.max(...target.indices);
    appendBuilding(target, box(8, 1), 0xffffff);
    expect(target.indices.length).toBe(firstCount * 2);
    expect(Math.min(...target.indices.slice(firstCount))).toBeGreaterThan(firstMax);
  });

  it('writes the colour on every vertex', () => {
    const target = emptyMeshArrays();
    appendBuilding(target, box(10, 1), 0xff0000);
    expect(target.colors[0]).toBeCloseTo(1, 5);
    expect(target.colors[1]).toBeCloseTo(0, 5);
    expect(target.colors[2]).toBeCloseTo(0, 5);
  });

  it('roofs a concave footprint', () => {
    const lShape = createBuildings([
      {
        id: 2,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 },
          { x: 20, z: 0 },
          { x: 20, z: 8 },
          { x: 8, z: 8 },
          { x: 8, z: 20 },
          { x: 0, z: 20 },
          { x: 0, z: 0 },
        ],
      },
    ])[0];
    const target = emptyMeshArrays();
    appendBuilding(target, lShape, 0xffffff);
    // 6 walls x 2 triangles + 4 roof triangles for a 6-corner ring
    expect(target.indices.length / 3).toBe(16);
  });

  it('faces every wall outward and the roof upward', () => {
    const target = emptyMeshArrays();
    const building = box(10, 2);
    appendBuilding(target, building, 0xffffff);

    const inward: number[] = [];
    const roofTriangles: number[] = [];
    for (let t = 0; t < target.indices.length / 3; t++) {
      const [i, j, k] = [0, 1, 2].map((o) => target.indices[t * 3 + o]);
      const va = new THREE.Vector3(target.positions[i * 3], target.positions[i * 3 + 1], target.positions[i * 3 + 2]);
      const vb = new THREE.Vector3(target.positions[j * 3], target.positions[j * 3 + 1], target.positions[j * 3 + 2]);
      const vc = new THREE.Vector3(target.positions[k * 3], target.positions[k * 3 + 1], target.positions[k * 3 + 2]);
      const normal = vb.clone().sub(va).cross(vc.clone().sub(va)).normalize();
      if (normal.y > 0.5) {
        roofTriangles.push(t);
        continue;
      }
      const mid = va.clone().add(vb).add(vc).divideScalar(3);
      const outward = mid.clone().sub(new THREE.Vector3(building.centroid.x, 0, building.centroid.z));
      if (normal.dot(outward) <= 0) inward.push(t);
    }
    expect(roofTriangles.length).toBeGreaterThan(0);
    expect(inward).toEqual([]);
  });
});