import { BuildingGrid, buildingSeed, createBuildings, floorsFor, FLOOR_HEIGHT, styleFor, TILE_SIZE } from './buildings';

const square = (size: number) => [
  { x: 0, z: 0 },
  { x: size, z: 0 },
  { x: size, z: size },
  { x: 0, z: size },
  { x: 0, z: 0 },
];

describe('styleFor', () => {
  it('collapses OSM types into five style classes', () => {
    expect(styleFor('house', 2)).toBe('home');
    expect(styleFor('detached', 4)).toBe('home');
    expect(styleFor('terrace', 2)).toBe('home');
    expect(styleFor('apartments', 2)).toBe('apartment');
    expect(styleFor('residential', 5)).toBe('apartment');
    expect(styleFor('retail', 1)).toBe('shop');
    expect(styleFor('commercial', 3)).toBe('shop');
    expect(styleFor('garage', 2)).toBe('hut');
    expect(styleFor('shed', 1)).toBe('hut');
    expect(styleFor('industrial', 4)).toBe('works');
    expect(styleFor('office', 4)).toBe('apartment');
    expect(styleFor('school', 3)).toBe('apartment');
    expect(styleFor('church', 2)).toBe('works');
    expect(styleFor('public', 4)).toBe('apartment');
    expect(styleFor('train_station', 2)).toBe('works');
  });

  it('promotes unlabelled buildings with 3+ floors to apartment', () => {
    expect(styleFor('yes', 1)).toBe('home');
    expect(styleFor('yes', 3)).toBe('apartment');
    expect(styleFor('yes', 4)).toBe('apartment');
    expect(styleFor('', 2)).toBe('home');
  });
});

describe('floorsFor', () => {
  it('trusts the OSM floor count when there is one', () => {
    expect(floorsFor('yes', 100, 7)).toBe(7);
    expect(floorsFor('yes', 100, 7, 99)).toBe(7);
  });

  it('ignores absurd floor counts', () => {
    expect(floorsFor('house', 100, 0)).toBe(2);
    expect(floorsFor('house', 100, 200)).toBe(2);
  });

  it('guesses by type when the count is missing', () => {
    expect(floorsFor('shed', 20)).toBe(1);
    expect(floorsFor('garage', 20)).toBe(1);
    expect(floorsFor('house', 120)).toBe(2);
    expect(floorsFor('apartments', 300)).toBe(4);
    expect(floorsFor('retail', 300)).toBe(3);
    expect(floorsFor('industrial', 900)).toBe(4);
  });

  it('guesses unlabelled buildings by footprint size', () => {
    expect(floorsFor('yes', 50)).toBe(1);
    expect(floorsFor('yes', 120)).toBe(2);
    expect(floorsFor('yes', 300)).toBe(3);
    expect(floorsFor('yes', 900)).toBe(4);
  });

  it('uses surveyed height when present and levels are missing', () => {
    expect(floorsFor('yes', 200, undefined, 12.8)).toBe(4);
    expect(floorsFor('yes', 200, undefined, 31.5)).toBe(10);
    expect(floorsFor('shed', 20, undefined, 2)).toBe(1);
  });

  it('applies the area ladder as a floor for most labelled types', () => {
    expect(floorsFor('house', 1500)).toBe(4);
    expect(floorsFor('warehouse', 55668)).toBe(4);
  });

  it('keeps huts at one floor regardless of size', () => {
    expect(floorsFor('shed', 900)).toBe(1);
    expect(floorsFor('garage', 900)).toBe(1);
  });
});

describe('buildingSeed', () => {
  it('is stable for an id and differs between ids', () => {
    expect(buildingSeed(10593273)).toBe(buildingSeed(10593273));
    expect(buildingSeed(10593273)).not.toBe(buildingSeed(10593274));
  });

  it('stays a non-negative 32-bit integer', () => {
    for (const id of [0, 1, 999, 10593273, 2 ** 31 + 7]) {
      const seed = buildingSeed(id);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('createBuildings', () => {
  it('drops the repeated closing point and keeps the ring open', () => {
    const [b] = createBuildings([
      { id: 1, type: 'house', name: '', levels: 2, points: square(10) },
    ]);
    expect(b.points).toHaveLength(4);
    expect(b.points[0]).toEqual({ x: 0, z: 0 });
  });

  it('computes area, centroid and height', () => {
    const [b] = createBuildings([
      { id: 1, type: 'house', name: '', levels: 2, points: square(10) },
    ]);
    expect(b.area).toBeCloseTo(100, 6);
    expect(b.centroid.x).toBeCloseTo(5, 6);
    expect(b.centroid.z).toBeCloseTo(5, 6);
    expect(b.floors).toBe(2);
    expect(b.height).toBeCloseTo(2 * FLOOR_HEIGHT, 6);
  });

  it('uses a surveyed height verbatim when present', () => {
    const [b] = createBuildings([
      { id: 1, type: 'yes', name: '', points: square(10), height: 12.8 },
    ]);
    expect(b.floors).toBe(4);
    expect(b.height).toBeCloseTo(12.8, 6);
  });

  it('levels win over height when both are present', () => {
    const [b] = createBuildings([
      { id: 1, type: 'yes', name: '', levels: 3, height: 99, points: square(10) },
    ]);
    expect(b.floors).toBe(3);
    expect(b.height).toBeCloseTo(99, 6);
  });

  it('promotes an unlabelled building with many floors to apartment', () => {
    const [b] = createBuildings([
      { id: 1, type: 'yes', name: '', points: square(20), height: 32 },
    ]);
    expect(b.style).toBe('apartment');
    expect(b.floors).toBe(10);
  });

  it('winds every ring the same way', () => {
    const clockwise = [...square(10)].reverse();
    const [b] = createBuildings([
      { id: 1, type: 'house', name: '', levels: 1, points: clockwise },
    ]);
    let twiceArea = 0;
    for (let i = 0; i < b.points.length; i++) {
      const p = b.points[i];
      const q = b.points[(i + 1) % b.points.length];
      twiceArea += p.x * q.z - q.x * p.z;
    }
    expect(twiceArea).toBeGreaterThan(0);
  });

  it('skips rings that cannot make a building', () => {
    const built = createBuildings([
      {
        id: 1,
        type: 'house',
        name: '',
        levels: 1,
        points: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 }],
      },
      { id: 2, type: 'house', name: '', levels: 1, points: square(0.5) },
      { id: 3, type: 'house', name: '', levels: 1, points: square(10) },
    ]);
    expect(built.map((b) => b.id)).toEqual([3]);
  });

  it('handles a concave L-shaped footprint', () => {
    const [b] = createBuildings([
      {
        id: 100,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 },
          { x: 2, z: 0 },
          { x: 2, z: 1 },
          { x: 1, z: 1 },
          { x: 1, z: 2 },
          { x: 0, z: 2 },
        ],
      },
    ]);
    expect(b.area).toBeCloseTo(3, 6);
    expect(b.centroid.x).toBeCloseTo(5 / 6, 6);
    expect(b.centroid.z).toBeCloseTo(5 / 6, 6);
  });
});

function at(id: number, x: number, z: number) {
  return {
    id,
    type: 'house',
    name: '',
    levels: 1,
    points: [
      { x, z },
      { x: x + 6, z },
      { x: x + 6, z: z + 6 },
      { x, z: z + 6 },
      { x, z },
    ],
  };
}

describe('BuildingGrid', () => {
  it('keeps the tile size at 500 m', () => {
    expect(TILE_SIZE).toBe(500);
  });

  it('groups buildings by the tile their centroid falls in', () => {
    const grid = new BuildingGrid(createBuildings([at(1, 10, 10), at(2, 30, 30), at(3, 1200, -800)]));
    const near = grid.tilesWithin(0, 0, 100);
    expect(near).toHaveLength(1);
    expect(grid.buildingsIn(near[0]).map((b) => b.id).sort()).toEqual([1, 2]);
  });

  it('returns every non-empty tile inside the radius', () => {
    const grid = new BuildingGrid(createBuildings([at(1, 10, 10), at(2, 1200, -800)]));
    expect(grid.tilesWithin(0, 0, 2000)).toHaveLength(2);
  });

  it('ignores empty tiles', () => {
    const grid = new BuildingGrid(createBuildings([at(1, 10, 10)]));
    expect(grid.tilesWithin(9000, 9000, 600)).toEqual([]);
  });

  it('reports the centre of a tile', () => {
    const grid = new BuildingGrid(createBuildings([at(1, 10, 10)]));
    const [key] = grid.tilesWithin(0, 0, 100);
    expect(grid.tileCentre(key)).toEqual({ x: 250, z: 250 });
  });

  it('returns an empty list for a tile it does not know', () => {
    const grid = new BuildingGrid(createBuildings([at(1, 10, 10)]));
    expect(grid.buildingsIn('99,99')).toEqual([]);
  });
});