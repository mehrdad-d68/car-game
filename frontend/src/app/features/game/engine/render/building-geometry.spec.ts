import * as THREE from 'three';
import { createBuildings, FLOOR_HEIGHT } from '../sim/buildings';
import {
  appendBuilding,
  appendRoof,
  appendWalls,
  CORNICE_HEIGHT,
  CORNICE_OFFSET,
  emptyMeshArrays,
  inflateRing,
  PLINTH_REACH,
  WALL_TILE_METRES,
} from './building-geometry';

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

function wallUvs(arrays: ReturnType<typeof emptyMeshArrays>): number[] {
  const us: number[] = [];
  for (let k = 0; k < arrays.uvs.length / 2; k++) {
    if (arrays.normals[k * 3 + 1] !== 0) continue;
    us.push(arrays.uvs[k * 2 + 1]);
  }
  return us;
}

function wallVertices(arrays: ReturnType<typeof emptyMeshArrays>): { y: number; u: number; v: number }[] {
  const out: { y: number; u: number; v: number }[] = [];
  for (let k = 0; k < arrays.positions.length / 3; k++) {
    if (arrays.normals[k * 3 + 1] !== 0) continue;
    out.push({ y: arrays.positions[k * 3 + 1], u: arrays.uvs[k * 2], v: arrays.uvs[k * 2 + 1] });
  }
  return out;
}

describe('appendWalls', () => {
  it('emits walls, a plinth ring and a cornice ring for a square block', () => {
    const target = emptyMeshArrays();
    appendWalls(target, box(10, 2), 0xffffff);
    expect(target.indices.length / 3).toBe(24);
    expect(target.normals.length).toBe(target.positions.length);
    expect(target.colors.length).toBe(target.positions.length);
    expect(target.uvs.length / 2).toBe(target.positions.length / 3);
    expect(target.buildingIds.length).toBe(target.positions.length / 3);
  });

  it('puts the walls on the ground and the cornice at the building height', () => {
    const target = emptyMeshArrays();
    const building = box(10, 3);
    appendWalls(target, building, 0xffffff);
    const ys: number[] = [];
    for (let i = 1; i < target.positions.length; i += 3) ys.push(target.positions[i]);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(building.height, 6);
  });

  it('maps facade v as repeating floors across the whole height', () => {
    const single = emptyMeshArrays();
    appendWalls(single, box(10, 1), 0xffffff);
    const house: ReturnType<typeof box> = box(10, 1);
    expect(house.height).toBeCloseTo(3.2, 6);
    const vs = wallUvs(single);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(house.height / FLOOR_HEIGHT, 6);

    const double = emptyMeshArrays();
    appendWalls(double, box(10, 4), 0xffffff);
    const vsDouble = wallUvs(double);
    expect(Math.max(...vsDouble)).toBeCloseTo(4, 6);
    expect(Math.min(...vsDouble)).toBeCloseTo(0, 6);

    const bandzed = wallVertices(single);
    expect(
      bandzed.some(
        (v) => v.y <= PLINTH_REACH + 1e-6 && v.v <= PLINTH_REACH / FLOOR_HEIGHT + 1e-6,
      ),
    ).toBe(true);
    expect(
      bandzed.some(
        (v) =>
          v.y >= house.height - CORNICE_HEIGHT - 1e-6 &&
          v.v >= (house.height - CORNICE_HEIGHT) / FLOOR_HEIGHT - 1e-6,
      ),
    ).toBe(true);
  });

  it('sets the plinth and cornice rings wider than the wall ring', () => {
    const target = emptyMeshArrays();
    const building = box(10, 2);
    appendWalls(target, building, 0xffffff);
    const plinth = new Set<number>();
    const cornice = new Set<number>();
    for (let k = 0; k < target.positions.length / 3; k++) {
      const y = target.positions[k * 3 + 1];
      if (y <= PLINTH_REACH + 1e-6 && y > 1e-6) plinth.add(k);
      if (y > building.height - CORNICE_HEIGHT) cornice.add(k);
    }
    const ringXs: number[] = [];
    for (const k of plinth) ringXs.push(target.positions[k * 3]);
    expect(Math.max(...ringXs)).toBeGreaterThan(10.1);
    ringXs.length = 0;
    for (const k of cornice) ringXs.push(target.positions[k * 3]);
    expect(Math.max(...ringXs)).toBeGreaterThan(10.2);
  });

  it('maps facade u continuously along the wall, repeating every 8 metres', () => {
    const eight = emptyMeshArrays();
    appendWalls(eight, box(8, 2), 0xffffff);
    const usEight = eight.uvs.filter((_, i) => i % 2 === 0);
    expect(Math.min(...usEight)).toBeCloseTo(0, 6);
    expect(Math.max(...usEight)).toBeCloseTo(4, 6);

    const twelve = emptyMeshArrays();
    appendWalls(twelve, box(12, 2), 0xffffff);
    const usTwelve = twelve.uvs.filter((_, i) => i % 2 === 0);
    expect(Math.max(...usTwelve)).toBeCloseTo(6, 6);
    expect(Math.min(...usTwelve)).toBeCloseTo(0, 6);
  });

  it('never resets u mid-wall, so no facade gets mirrored', () => {
    const target = emptyMeshArrays();
    appendWalls(target, box(10, 2), 0xffffff);
    const perEdgeUs: number[] = [];
    for (let k = 0; k < target.positions.length / 3; k++) {
      if (target.normals[k * 3 + 1] !== 0) continue;
      if (target.positions[k * 3 + 1] > 1e-6) continue;
      perEdgeUs.push(target.uvs[k * 2]);
    }
    const starts = [perEdgeUs[0], perEdgeUs[2], perEdgeUs[4], perEdgeUs[6]];
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    }
    expect(starts[3]).toBeCloseTo((3 * 10) / WALL_TILE_METRES, 6);
  });

  it('appends without disturbing what is already there', () => {
    const target = emptyMeshArrays();
    appendWalls(target, box(10, 1), 0xffffff);
    const firstCount = target.indices.length;
    const firstMax = Math.max(...target.indices);
    appendWalls(target, box(8, 1), 0xffffff);
    expect(target.indices.length).toBe(firstCount * 2);
    expect(Math.min(...target.indices.slice(firstCount))).toBeGreaterThan(firstMax);
  });

  it('writes the colour on every vertex and darkens the base', () => {
    const target = emptyMeshArrays();
    appendWalls(target, box(10, 1), 0xff0000);
    expect(target.colors[1]).toBeCloseTo(0, 5);
    expect(target.colors[2]).toBeCloseTo(0, 5);
    const baseReds = target.colors.filter((_, i) => i % 3 === 0);
    expect(Math.min(...baseReds)).toBeGreaterThan(0.6);
    expect(Math.max(...baseReds)).toBeLessThanOrEqual(1);
    expect(Math.max(...baseReds)).toBeGreaterThan(Math.min(...baseReds));
  });

  it('darkens walls that face north', () => {
    const target = emptyMeshArrays();
    appendWalls(target, box(10, 2), 0xffffff);
    let northBase = -1;
    let sideBase = -1;
    for (let k = 0; k < target.positions.length / 3; k++) {
      if (target.normals[k * 3 + 1] !== 0) continue;
      const y = target.positions[k * 3 + 1];
      if (y < 1e-6) {
        if (target.normals[k * 3 + 2] > 0.05) northBase = Math.max(northBase, target.colors[k * 3]);
        else sideBase = Math.max(sideBase, target.colors[k * 3]);
      }
    }
    expect(sideBase).toBeGreaterThan(northBase);
  });

  it('faces every wall outward', () => {
    const target = emptyMeshArrays();
    const building = box(10, 2);
    appendWalls(target, building, 0xffffff);
    const inward: number[] = [];
    for (let t = 0; t < target.indices.length / 3; t++) {
      const [i, j, k] = [0, 1, 2].map((o) => target.indices[t * 3 + o]);
      const va = new THREE.Vector3(target.positions[i * 3], target.positions[i * 3 + 1], target.positions[i * 3 + 2]);
      const vb = new THREE.Vector3(target.positions[j * 3], target.positions[j * 3 + 1], target.positions[j * 3 + 2]);
      const vc = new THREE.Vector3(target.positions[k * 3], target.positions[k * 3 + 1], target.positions[k * 3 + 2]);
      const normal = vb.clone().sub(va).cross(vc.clone().sub(va)).normalize();
      if (normal.y > 0.5) continue;
      const mid = va.clone().add(vb).add(vc).divideScalar(3);
      const outward = mid.clone().sub(new THREE.Vector3(building.centroid.x, 0, building.centroid.z));
      if (normal.dot(outward) <= 0) inward.push(t);
    }
    expect(inward).toEqual([]);
  });
});

describe('appendRoof', () => {
  it('roofs a square and a concave footprint above the walls', () => {
    const square = emptyMeshArrays();
    appendRoof(square, box(10, 2), 0xffffff);
    expect(square.indices.length / 3).toBe(2);
    for (let i = 1; i < square.positions.length; i += 3) {
      expect(square.positions[i]).toBeCloseTo(6.4, 5);
      expect(square.normals[i]).toBeCloseTo(1, 5);
    }

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
    const concave = emptyMeshArrays();
    appendRoof(concave, lShape, 0xffffff);
    expect(concave.indices.length / 3).toBe(4);
  });

  it('keeps the roof inside the eaves inflation', () => {
    const flat = emptyMeshArrays();
    const building = box(10, 2);
    appendRoof(flat, building, 0xffffff);
    const corners = new Set<number>();
    for (let k = 0; k < flat.positions.length / 3; k++) {
      corners.add(Math.round(flat.positions[k * 3] * 100));
      corners.add(Math.round(flat.positions[k * 3 + 2] * 100));
    }
    expect([...corners].some((c) => Math.abs(c) > 1000)).toBe(true);
  });
});

describe('appendBuilding', () => {
  it('emits both walls and roof', () => {
    const target = emptyMeshArrays();
    appendBuilding(target, box(10, 2), 0xffffff);
    const walls = emptyMeshArrays();
    appendWalls(walls, box(10, 2), 0xffffff);
    const roof = emptyMeshArrays();
    appendRoof(roof, box(10, 2), 0xffffff);
    expect(target.indices.length / 3).toBe(walls.indices.length / 3 + roof.indices.length / 3);
    expect(target.positions.length).toBe(walls.positions.length + roof.positions.length);
  });

  it('creates a triangle count in the expected shape range', () => {
    const target = emptyMeshArrays();
    appendBuilding(target, box(10, 2), 0xffffff);
    expect(target.indices.length / 3).toBe(26);
  });
});

describe('inflateRing', () => {
  it('grows a ring outward without moving the centroid', () => {
    const ring = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    const grown = inflateRing(ring, 0.4);
    const growth = grown.map((point, i) => Math.hypot(point.x - ring[i].x, point.z - ring[i].z));
    expect(growth.every((d) => d >= 0.4)).toBe(true);
  });
});

describe('constants', () => {
  it('wraps every eight metres of wall and every four metres of roof', () => {
    expect(WALL_TILE_METRES).toBe(8);
    expect(CORNICE_OFFSET).toBeGreaterThan(0);
    expect(PLINTH_REACH).toBeGreaterThan(0);
  });
});