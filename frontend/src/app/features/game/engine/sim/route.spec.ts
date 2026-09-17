import { buildRoadGraph } from './road-graph';
import { planRoute, RouteStart } from './route';
import { PolylineRoad } from './track';

function road(
  name: string,
  overrides: Partial<PolylineRoad> & { points: PolylineRoad['points'] },
): PolylineRoad {
  return {
    name,
    type: 'residential',
    lanes: 2,
    width: 8,
    oneway: 0,
    access: 'yes',
    ...overrides,
  };
}

describe('planRoute output', () => {
  it('does not share point objects with the graph', () => {
    const roads = [
      { name: 'A', type: 'residential', lanes: 2, width: 8, oneway: 0 as const, access: 'yes', points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, { position: { x: 10, z: 0 }, heading: 0 }, 'A')!;
    const before = graph.nodes.map((n) => ({ ...n }));
    for (const p of route.points) p.x += 1000;
    expect(graph.nodes).toEqual(before);
  });
});

function at(x: number, z: number): RouteStart {
  return { position: { x, z }, heading: 0 };
}

const DIAMOND: PolylineRoad[] = [
  road('Feeder', { points: [{ x: 0, z: -80 }, { x: 0, z: 0 }] }),
  road('Direct', {
    points: [
      { x: 0, z: 0 },
      { x: 30, z: 0 },
      { x: 60, z: 0 },
    ],
  }),
  road('Detour', {
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 40 },
      { x: 60, z: 40 },
      { x: 60, z: 0 },
    ],
  }),
  road('EndStreet', {
    points: [
      { x: 60, z: 0 },
      { x: 80, z: 0 },
    ],
  }),
];

describe('planRoute', () => {
  it('plans a route to the destination street', () => {
    const roads = [
      road('Main', { points: [{ x: 0, z: -100 }, { x: 0, z: 0 }, { x: 0, z: 100 }] }),
      road('Cross', { points: [{ x: -100, z: 0 }, { x: 0, z: 0 }, { x: 100, z: 0 }] }),
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(0, -80), 'Cross');
    expect(route).not.toBeNull();
    expect(route!.street).toBe('Cross');
    expect(route!.points[0]).toEqual({ x: 0, z: -80 });
    expect(route!.points[route!.points.length - 1]).toEqual({ x: 0, z: 0 });
    expect(route!.length).toBeCloseTo(80, 3);
    expect(route!.cumulative[route!.cumulative.length - 1]).toBeCloseTo(route!.length, 3);
  });

  it('chooses the shorter of two paths', () => {
    const graph = buildRoadGraph(DIAMOND);
    const route = planRoute(graph, DIAMOND, at(0, -80), 'EndStreet');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo(140, 1);
  });

  it('a one-way road forces the longer way round', () => {
    const roads: PolylineRoad[] = DIAMOND.map((r) =>
      r.name === 'Direct'
        ? road('Direct', {
            oneway: 1,
            points: [
              { x: 60, z: 0 },
              { x: 30, z: 0 },
              { x: 0, z: 0 },
            ],
          })
        : r,
    );
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(0, -80), 'EndStreet');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo(220, 1);
  });

  it('resolves to the nearest node of the destination street', () => {
    const roads = [
      road('Long', { points: [{ x: -200, z: 0 }, { x: -100, z: 0 }, { x: 200, z: 0 }] }),
      road('Approach', { points: [{ x: -100, z: -100 }, { x: -100, z: 0 }] }),
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(-100, -80), 'Long');
    expect(route).not.toBeNull();
    const end = route!.points[route!.points.length - 1];
    expect(end.x).toBeCloseTo(-100, 1);
    expect(end.z).toBeCloseTo(0, 1);
  });

  it('returns null when the street is not in the map', () => {
    const graph = buildRoadGraph(DIAMOND);
    expect(planRoute(graph, DIAMOND, at(0, -80), 'Nowhere')).toBeNull();
  });

  it('allows driving along the destination street even when private', () => {
    const roads = [
      road('Public', { points: [{ x: 0, z: -100 }, { x: 0, z: 0 }] }),
      road('Villa', {
        access: 'private',
        points: [
          { x: 0, z: 0 },
          { x: 0, z: 100 },
        ],
      }),
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(0, -80), 'Villa');
    expect(route).not.toBeNull();
    expect(route!.street).toBe('Villa');
    expect(route!.points[route!.points.length - 1].z).toBeCloseTo(0, 1);
    expect(route!.length).toBeCloseTo(80, 1);
  });

  it('never travels through a private road to reach another street', () => {
    const roads = [
      road('Public', { points: [{ x: 0, z: -100 }, { x: 0, z: 0 }, { x: 0, z: 100 }] }),
      road('Villa', {
        access: 'private',
        points: [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
      }),
      road('Connection', { points: [{ x: 0, z: 100 }, { x: 100, z: 100 }] }),
      road('Far', { points: [{ x: 100, z: 0 }, { x: 100, z: 100 }] }),
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(0, -80), 'Far');
    expect(route).not.toBeNull();
    const end = route!.points[route!.points.length - 1];
    expect(end.x).toBeCloseTo(100, 1);
    expect(end.z).toBeCloseTo(100, 1);
    expect(route!.length).toBeCloseTo(280, 2);
  });

  it('seeds a one-way segment only at its forward end', () => {
    const roads = [
      road('OneWay', {
        oneway: 1,
        points: [
          { x: 0, z: 0 },
          { x: 0, z: 60 },
        ],
      }),
      road('Curve', { points: [{ x: 0, z: 60 }, { x: 60, z: 60 }] }),
      road('Top', { points: [{ x: 60, z: 60 }, { x: 60, z: 140 }] }),
    ];
    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, at(0, 10), 'Top');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo(110, 1);
    expect(route!.points[0]).toEqual({ x: 0, z: 10 });
  });

  it('returns a trivial route when the car is already on the destination street', () => {
    const graph = buildRoadGraph(DIAMOND);
    const route = planRoute(graph, DIAMOND, at(65, 0), 'EndStreet');
    expect(route).not.toBeNull();
    expect(route!.length).toBeLessThan(10);
  });
});