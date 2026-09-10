import { validateMapData } from './map-validator';

function validMap(): Record<string, unknown> {
  return {
    meta: {
      source: 'openstreetmap',
      generatedAt: '2026-09-04T11:47:45.177Z',
      place: 'custom bbox',
      center: { lat: 48.14, lng: 16.29 },
      bbox: { south: 48.13, west: 16.25, north: 48.16, east: 16.33 },
      totalRoads: 2,
    },
    roads: [
      {
        id: 1,
        type: 'motorway',
        name: 'Test',
        lanes: 2,
        width: 12,
        oneway: 1,
        access: 'yes',
        points: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
      },
      {
        id: 2,
        type: 'residential',
        name: '',
        lanes: 1,
        width: 8,
        oneway: -1,
        access: 'private',
        points: [
          { x: 5, z: 5 },
          { x: 5, z: 55 },
          { x: 9, z: 55 },
        ],
      },
    ],
  };
}

function validItems(): Record<string, unknown> {
  return {
    items: [
      { kind: 'trafficLight', id: 368126, x: -100, z: 200 },
      { kind: 'pedestrianCrossing', id: 25207381, x: 150, z: 200 },
      {
        kind: 'busStop',
        id: 21662099,
        x: 100,
        z: 200,
        name: 'Notre-Dame',
        type: 'platform',
      },
      { kind: 'gasStation', id: 1, x: 100, z: 100, name: 'Shell' },
      { kind: 'policeStation', id: 4, x: -100, z: -200, name: 'Polizei' },
      {
        kind: 'busStop',
        id: 5,
        x: 10,
        z: 10,
        name: 'Platz',
        type: 'platform',
        width: 25,
        depth: 5,
        area: 120,
      },
      { kind: 'hospital', id: 6, x: 50, z: 60, name: 'Klinik', width: 770.6, depth: 482.6 },
    ],
  };
}

function mapWithItems(): Record<string, unknown> {
  return { ...validMap(), ...validItems() };
}

describe('validateMapData', () => {
  it('accepts a well-formed map', () => {
    const result = validateMapData(validMap());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a non-object root', () => {
    for (const value of [null, 42, 'roads', [], true] as unknown[]) {
      const result = validateMapData(value);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Map root must be an object');
    }
  });

  it('rejects missing roads', () => {
    const map = validMap();
    delete map.roads;
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('roads must be an array');
  });

  it('rejects a road with fewer than two points', () => {
    const map = validMap();
    (map.roads as unknown[]).push({
      id: 3,
      type: 'service',
      name: 'Dock',
      lanes: 1,
      width: 6,
      oneway: 0,
      access: 'yes',
      points: [{ x: 0, z: 0 }],
    });
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('roads[2].points must contain at least 2 points');
  });

  it('rejects a non-numeric point coordinate', () => {
    const map = validMap();
    (map.roads as { points: unknown[] }[])[0].points.push({ x: 'oops', z: 4 });
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('roads[0].points[2].x must be a finite number');
  });

  it('rejects a oneway value outside 0, 1, -1', () => {
    const map = validMap();
    (map.roads as { oneway: unknown }[])[1].oneway = 2;
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('roads[1].oneway must be one of 0, 1, -1');
  });

  it('rejects a non-numeric lane count and width', () => {
    const map = validMap();
    (map.roads as { lanes: unknown; width: unknown }[])[0].lanes = 'two';
    (map.roads as { lanes: unknown; width: unknown }[])[0].width = NaN;
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('roads[0].lanes must be a finite number');
    expect(result.errors).toContain('roads[0].width must be a finite number');
  });

  it('rejects meta without a valid center and bbox', () => {
    const map = validMap();
    (map.meta as Record<string, unknown>).center = { lat: 'north' };
    (map.meta as Record<string, unknown>).bbox = { south: 0, west: 0 };
    const result = validateMapData(map);
    expect(result.errors).toContain('meta.center.lat must be a finite number');
    expect(result.errors).toContain('meta.center.lng must be a finite number');
    expect(result.errors).toContain('meta.bbox.north must be a finite number');
    expect(result.errors).toContain('meta.bbox.east must be a finite number');
  });

  it('reports multiple independent problems together', () => {
    const result = validateMapData({ meta: null, roads: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['meta must be an object', 'roads must be an array']),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts items of every kind', () => {
    const result = validateMapData(mapWithItems());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a map without items or roads sections missing', () => {
    const result = validateMapData(validMap());
    expect(result.valid).toBe(true);
  });

  it('rejects a non-array items section', () => {
    const map = validMap();
    (map as Record<string, unknown>).items = 'nope';
    const result = validateMapData(map);
    expect(result.errors).toContain('items must be an array');
  });

  it('rejects an item with an unknown kind', () => {
    const map = mapWithItems();
    (map.items as Record<string, unknown>[])[0].kind = 'dracula';
    const result = validateMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'items[0].kind must be one of trafficLight, pedestrianCrossing, busStop, gasStation, fireStation, hospital, policeStation',
    );
  });

  it('rejects an item with a missing kind', () => {
    const map = mapWithItems();
    delete (map.items as Record<string, unknown>[])[0].kind;
    const result = validateMapData(map);
    expect(result.errors).toContain('items[0].kind must be a string');
  });

  it('rejects an item with a missing x', () => {
    const map = mapWithItems();
    delete (map.items as Record<string, unknown>[])[0].x;
    const result = validateMapData(map);
    expect(result.errors).toContain('items[0].x must be a finite number');
  });

  it('rejects a bus stop with an invalid stop type', () => {
    const map = mapWithItems();
    (map.items as Record<string, unknown>[])[2].type = 'station';
    const result = validateMapData(map);
    expect(result.errors).toContain(
      "items[2].type must be either 'platform' or 'stop_position'",
    );
  });

  it('rejects a bus stop without a name', () => {
    const map = mapWithItems();
    delete (map.items as Record<string, unknown>[])[2].name;
    const result = validateMapData(map);
    expect(result.errors).toContain('items[2].name must be a string');
  });

  it('rejects a station without a name', () => {
    const map = mapWithItems();
    delete (map.items as Record<string, unknown>[])[3].name;
    const result = validateMapData(map);
    expect(result.errors).toContain('items[3].name must be a string');
  });

  it('rejects a non-object item', () => {
    const map = mapWithItems();
    (map.items as unknown[]).push(42);
    const result = validateMapData(map);
    expect(result.errors).toContain('items[7] must be an object');
  });

  it('rejects a negative or non-numeric footprint dimension', () => {
    const map = mapWithItems();
    (map.items as Record<string, unknown>[])[3].width = -5;
    (map.items as Record<string, unknown>[])[5].depth = 'wide';
    const result = validateMapData(map);
    expect(result.errors).toContain(
      'items[3].width must be a non-negative finite number',
    );
    expect(result.errors).toContain(
      'items[5].depth must be a non-negative finite number',
    );
  });
});