import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeMapData, mergeRoadWays } from '../../../scripts/merge-road-ways';
import { OSMMapData, OSMRoad } from './osm-types';

function road(
  id: number,
  name: string,
  pts: { x: number; z: number }[],
  overrides: Partial<OSMRoad> = {},
): OSMRoad {
  return {
    id,
    name,
    type: 'residential',
    lanes: 2,
    width: 8,
    oneway: 0,
    access: 'yes',
    points: pts,
    ...overrides,
  };
}

describe('mergeRoadWays', () => {
  it('joins two fragments of the same street at a shared endpoint', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ]),
      road(2, 'Main', [
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].points).toEqual([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 20, z: 0 },
    ]);
    expect(merged[0].id).toBe(1);
  });

  it('keeps separate streets with different names, even sharing a node', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ]),
      road(2, 'Side', [
        { x: 10, z: 0 },
        { x: 10, z: 10 },
      ]),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('does not merge across a class change', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { type: 'residential' },
      ),
      road(
        2,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ],
        { type: 'tertiary' },
      ),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('does not merge a one-way continuation against a two-way', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { oneway: 1 },
      ),
      road(
        2,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ],
        { oneway: 0 },
      ),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('does not merge one-way fragments that meet head-to-head', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { oneway: 1 },
      ),
      road(
        2,
        'Main',
        [
          { x: 20, z: 0 },
          { x: 10, z: 0 },
        ],
        { oneway: 1 },
      ),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('does not merge one-way fragments that start tail-to-tail', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ],
        { oneway: 1 },
      ),
      road(
        2,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 0, z: 0 },
        ],
        { oneway: 1 },
      ),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('chains one-way fragments in their direction of travel regardless of order', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ],
        { oneway: 1 },
      ),
      road(
        2,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { oneway: 1 },
      ),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].points).toEqual([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 20, z: 0 },
    ]);
    expect(merged[0].oneway).toBe(1);
  });

  it('keeps a one-way -1 merge travelling in the traffic direction', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 0, z: 0 },
        ],
        { oneway: -1 },
      ),
      road(
        2,
        'Main',
        [
          { x: 20, z: 0 },
          { x: 10, z: 0 },
        ],
        { oneway: -1 },
      ),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].points).toEqual([
      { x: 20, z: 0 },
      { x: 10, z: 0 },
      { x: 0, z: 0 },
    ]);
    expect(merged[0].oneway).toBe(-1);
  });

  it('does not merge fragments with different access', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { access: 'yes' },
      ),
      road(
        2,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ],
        { access: 'private' },
      ),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('reverses a fragment that points into the shared node', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 10, z: 0 },
        { x: 0, z: 0 },
      ]),
      road(2, 'Main', [
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].points[0]).toEqual({ x: 0, z: 0 });
    expect(merged[0].points[2]).toEqual({ x: 20, z: 0 });
  });

  it('stops at a junction where three roads meet', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ]),
      road(2, 'Main', [
        { x: 0, z: 10 },
        { x: 10, z: 10 },
      ]),
      road(3, 'Main', [
        { x: 0, z: 10 },
        { x: 0, z: 20 },
      ]),
    ]);
    expect(merged).toHaveLength(3);
  });

  it('stops at a dead end', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ]),
      road(2, 'Side', [
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ]),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('chains through several fragments', () => {
    const merged = mergeRoadWays([
      road(1, 'Main', [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ]),
      road(2, 'Main', [
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ]),
      road(3, 'Main', [
        { x: 20, z: 0 },
        { x: 30, z: 0 },
      ]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].points).toHaveLength(4);
  });

  it('leaves a closed ring road untouched', () => {
    const ring = road(9, 'Loop', [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 0 },
    ]);
    const merged = mergeRoadWays([ring]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(ring);
  });

  it('takes lanes and width from the longer fragment', () => {
    const merged = mergeRoadWays([
      road(
        1,
        'Main',
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        { lanes: 1, width: 6 },
      ),
      road(
        2,
        'Main',
        [
          { x: 10, z: 0 },
          { x: 210, z: 0 },
        ],
        { lanes: 3, width: 10 },
      ),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lanes).toBe(3);
    expect(merged[0].width).toBe(10);
  });

  it('is identity for an empty input', () => {
    expect(mergeRoadWays([])).toEqual([]);
  });
});

describe('mergeMapData', () => {
  it('updates meta.totalRoads to the merged count', () => {
    const data: OSMMapData = {
      meta: {
        source: 'openstreetmap',
        generatedAt: '2026-01-01T00:00:00Z',
        place: 'test',
        center: { lat: 0, lng: 0 },
        bbox: { south: 0, west: 0, north: 1, east: 1 },
        totalRoads: 2,
      },
      roads: [
        road(1, 'Main', [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ]),
        road(2, 'Main', [
          { x: 10, z: 0 },
          { x: 20, z: 0 },
        ]),
      ],
    };
    const merged = mergeMapData(data);
    expect(merged.roads).toHaveLength(1);
    expect(merged.meta.totalRoads).toBe(1);
  });

  it('is idempotent on the real map file', () => {
    const raw = readFileSync(
      join(__dirname, 'data', 'vienna-roads.json'),
      'utf8',
    );
    const data = JSON.parse(raw) as OSMMapData;
    const once = mergeMapData(data);
    const twice = mergeMapData(once);
    expect(twice).toEqual(once);
    expect(once.roads.length).toBeLessThanOrEqual(data.roads.length);
  });

  it('leaves the Erlaaer Platz fragments as a single road', () => {
    const raw = readFileSync(
      join(__dirname, 'data', 'vienna-roads.json'),
      'utf8',
    );
    const data = JSON.parse(raw) as OSMMapData;
    const merged = mergeMapData(data);
    const count = merged.roads
      .filter((r) => r.name === 'Erlaaer Platz' && r.type === 'secondary')
      .map((r) => r.id);
    expect(count.length).toBe(3);
  });
});
