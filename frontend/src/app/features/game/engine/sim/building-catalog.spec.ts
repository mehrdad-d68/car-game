import { createBuildings, Building } from './buildings';
import { BuildingSpec } from './building-spec';
import { roofFrame } from './footprint';
import {
  chooseSpec,
  fitSpec,
  placeSpec,
  placementClaims,
  placementIndex,
  resolveAssignments,
} from './building-catalog';

const HOUSE: BuildingSpec = {
  id: 'house',
  name: 'House',
  category: 'house',
  footprint: { width: 8, depth: 12, tolerance: 2.5 },
  height: 5,
  floors: 1,
  match: { osmTypes: ['house'], weight: 2 },
  parts: [],
};

const APARTMENTS: BuildingSpec = {
  id: 'apartment-block',
  name: 'Apartment block',
  category: 'apartment',
  footprint: { width: 20, depth: 14, tolerance: 4 },
  height: 14,
  floors: 4,
  match: { osmTypes: ['residential', 'apartments'], weight: 1 },
  parts: [],
};

function buildingAt(
  id: number,
  width: number,
  depth: number,
  type: string = 'house',
): Building {
  return createBuildings([
    {
      id,
      type,
      name: '',
      levels: 1,
      points: [
        { x: 0, z: 0 },
        { x: width, z: 0 },
        { x: width, z: depth },
        { x: 0, z: depth },
      ],
    },
  ])[0];
}

describe('chooseSpec', () => {
  it('picks a spec whose footprint dims match within tolerance', () => {
    const b = buildingAt(1, 12, 8);
    expect(chooseSpec(b, [HOUSE, APARTMENTS])?.id).toBe('house');
  });

  it('accepts a 90°-turned footprint shape', () => {
    const b = buildingAt(2, 8, 12);
    expect(chooseSpec(b, [HOUSE, APARTMENTS])?.id).toBe('house');
  });

  it('respects the tolerance around each dim', () => {
    const exact = buildingAt(3, 12, 8);
    expect(chooseSpec(exact, [HOUSE])?.id).toBe('house');
    const near = buildingAt(4, 13, 7);
    expect(chooseSpec(near, [HOUSE])?.id).toBe('house');
    const tooFar = buildingAt(5, 16, 8);
    expect(chooseSpec(tooFar, [HOUSE])).toBeNull();
  });

  it('excludes spec when the OSM type is not allowed', () => {
    const shop: BuildingSpec = {
      ...HOUSE,
      id: 'shop',
      category: 'shop',
      footprint: { width: 10, depth: 8, tolerance: 2.5 },
      match: { osmTypes: ['retail'] },
    };
    const b = buildingAt(6, 10, 8);
    expect(chooseSpec(b, [shop])).toBeNull();
  });

  it('lets a generic-type building match on size and floors alone', () => {
    const shop: BuildingSpec = {
      ...HOUSE,
      id: 'shop',
      category: 'shop',
      footprint: { width: 10, depth: 8, tolerance: 2.5 },
      match: { osmTypes: ['retail'], weight: 1 },
    };
    const genericHouse = buildingAt(40, 12, 8, 'yes');
    expect(chooseSpec(genericHouse, [HOUSE])?.id).toBe('house');
    expect(chooseSpec(genericHouse, [shop])?.id).toBe('shop');
    const apartmentSized = buildingAt(41, 20, 14, 'yes');
    expect(chooseSpec(apartmentSized, [APARTMENTS])?.id).toBe('apartment-block');
    expect(chooseSpec(buildingAt(42, 10, 8), [shop])).toBeNull();
  });

  it('enforces area bounds', () => {
    const big: BuildingSpec = {
      ...HOUSE,
      match: { ...HOUSE.match, minArea: 500 },
    };
    const b = buildingAt(7, 12, 8);
    expect(b.area).toBe(96);
    expect(chooseSpec(b, [big])).toBeNull();
  });

  it('returns null when no footprint matches', () => {
    const b = buildingAt(8, 30, 20, 'apartments');
    expect(chooseSpec(b, [HOUSE, APARTMENTS])).toBeNull();
    const huge = buildingAt(9, 50, 40, 'apartments');
    expect(chooseSpec(huge, [HOUSE, APARTMENTS])).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = buildingAt(10, 12, 8);
    expect(chooseSpec(a, [HOUSE, APARTMENTS])?.id).toBe(
      chooseSpec(a, [HOUSE, APARTMENTS])?.id,
    );
  });
});

describe('fitSpec', () => {
  it('places an exact-fit box at the centroid along the longest wall', () => {
    const b = buildingAt(20, 12, 8);
    const fit = fitSpec(b, HOUSE);
    expect(fit).not.toBeNull();
    expect(fit!.x).toBeCloseTo(6, 6);
    expect(fit!.z).toBeCloseTo(4, 6);
    expect(fit!.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(fit!.scale.x).toBeCloseTo(1, 6);
    expect(fit!.scale.z).toBeCloseTo(1, 6);
  });

  it('returns null when scaling would leave the ±15% band', () => {
    const wide = buildingAt(21, 10, 10);
    expect(fitSpec(wide, HOUSE)).toBeNull();
  });

  it('returns null when the footprint does not fit the roof frame', () => {
    const lShape = createBuildings([
      {
        id: 22,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 },
          { x: 2, z: 10 },
          { x: 2, z: 2 },
          { x: 0, z: 2 },
        ],
      },
    ])[0];
    expect(fitSpec(lShape, HOUSE)).toBeNull();
  });

  it('fits a building to a larger spec by modest scaling', () => {
    const b = buildingAt(23, 18, 13);
    const fit = fitSpec(b, APARTMENTS);
    expect(fit).not.toBeNull();
    expect(fit!.scale.x).toBeCloseTo(0.9, 6);
    expect(fit!.scale.z).toBeCloseTo(13 / 14, 6);
  });

  it('turns a matching footprint 90° when it sits the long way round', () => {
    const b = buildingAt(24, 20, 14);
    const frame = roofFrame(b);
    const fit = fitSpec(b, APARTMENTS);
    expect(fit).not.toBeNull();
    expect(fit!.scale.x).toBeCloseTo(1, 6);
    expect(fit!.scale.z).toBeCloseTo(1, 6);
    expect(fit!.yaw).toBeCloseTo(frame.yaw + Math.PI / 2, 6);
  });
});

describe('placementIndex', () => {
  it('groups placements by tile', () => {
    const index = placementIndex([
      { specId: 'house', x: 5, z: 5, yaw: 0 },
      { specId: 'shop', x: 560, z: 5, yaw: 0 },
      { specId: 'flat', x: -260, z: 5, yaw: 0 },
    ]);
    expect(index.get(`0,0`)).toHaveLength(1);
    expect(index.get(`1,0`)).toHaveLength(1);
    expect(index.get(`-1,0`)).toHaveLength(1);
  });
});

describe('placementClaims', () => {
  it('claims buildings near a placement and spares distant ones', () => {
    const near = buildingAt(30, 12, 8);
    const far = buildingAt(31, 12, 8);
    far.centroid.x += 60;
    const claims = placementClaims(
      [near, far],
      [{ specId: 'house', x: near.centroid.x, z: near.centroid.z, yaw: 0 }],
      new Map([['house', HOUSE]]),
    );
    expect(claims.has(30)).toBe(true);
    expect(claims.has(31)).toBe(false);
  });
});

describe('placeSpec', () => {
  it('uses the fitted placement when the footprint is close to the design', () => {
    const building = buildingAt(1, 8, 12);
    const fitted = fitSpec(building, HOUSE)!;
    expect(fitted).not.toBeNull();
    expect(placeSpec(building, HOUSE)).toEqual(fitted);
  });

  it('places at the size the design declares when the footprint is far too long', () => {
    const building = buildingAt(2, 8, 40);
    expect(fitSpec(building, HOUSE)).toBeNull();
    const placed = placeSpec(building, HOUSE);
    expect(placed.scale).toEqual({ x: 1, z: 1 });
    expect(placed.x).toBeCloseTo(building.centroid.x, 6);
    expect(placed.z).toBeCloseTo(building.centroid.z, 6);
  });

  it('never stretches a hand-placed design', () => {
    for (const depth of [4, 12, 30, 80]) {
      const placed = placeSpec(buildingAt(3, 8, depth), HOUSE);
      expect(Math.abs(placed.scale.x - 1)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(placed.scale.z - 1)).toBeLessThanOrEqual(0.15);
    }
  });
});

describe('resolveAssignments', () => {
  const specs = [HOUSE, APARTMENTS];

  it('resolves an entry to its design', () => {
    const building = buildingAt(10, 8, 12);
    const resolved = resolveAssignments([building], { '10': { spec: 'house' } }, specs);
    expect(resolved.get(10)!.spec.id).toBe('house');
  });

  it('leaves a building with no entry to the procedural path', () => {
    const building = buildingAt(11, 8, 12);
    expect(resolveAssignments([building], {}, specs).has(11)).toBe(false);
  });

  it('takes a null entry back to the procedural path', () => {
    const building = buildingAt(12, 8, 12);
    const resolved = resolveAssignments([building], { '12': { spec: null } }, specs);
    expect(resolved.has(12)).toBe(false);
  });

  it('ignores an entry naming a design that is not in the catalog', () => {
    const building = buildingAt(13, 8, 12);
    const resolved = resolveAssignments([building], { '13': { spec: 'chapel' } }, specs);
    expect(resolved.has(13)).toBe(false);
  });

  it('logs a warning for an entry naming a design that is not in the catalog', () => {
    const building = buildingAt(13, 8, 12);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resolveAssignments([building], { '13': { spec: 'chapel' } }, specs);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once per unknown design even when many buildings name it', () => {
    const first = buildingAt(17, 8, 12);
    const second = buildingAt(18, 30, 40);
    const third = buildingAt(19, 40, 8);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resolveAssignments(
      [first, second, third],
      { '17': { spec: 'chapel' }, '18': { spec: 'chapel' }, '19': { spec: 'chapel' } },
      specs,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('ignores an id that is not on the map', () => {
    const building = buildingAt(14, 8, 12);
    const resolved = resolveAssignments([building], { '999': { spec: 'house' } }, specs);
    expect(resolved.size).toBe(0);
  });

  it('honours a hand-written yaw and scale over the computed placement', () => {
    const building = buildingAt(15, 8, 12);
    const resolved = resolveAssignments(
      [building],
      { '15': { spec: 'house', yaw: 1.25, scale: [1.4, 0.6] } },
      specs,
    );
    const fit = resolved.get(15)!.fit;
    expect(fit.yaw).toBeCloseTo(1.25, 6);
    expect(fit.scale).toEqual({ x: 1.4, z: 0.6 });
  });

  it('assigns a design the rules would have refused', () => {
    const building = buildingAt(16, 8, 40);
    expect(chooseSpec(building, specs)).toBeNull();
    const resolved = resolveAssignments([building], { '16': { spec: 'house' } }, specs);
    expect(resolved.get(16)!.spec.id).toBe('house');
    expect(resolved.get(16)!.fit.scale).toEqual({ x: 1, z: 1 });
  });
});
