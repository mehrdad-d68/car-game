import { OSMMapData } from './osm-types';
import { createTrack } from './track';
import { buildRoadGraph } from './road-graph';
import { formatReport, inspectPoint, nearestRoadHeading } from './inspect';
import { ReportExtras } from './inspect';

const META = {
  source: 'openstreetmap',
  generatedAt: '2026-01-01T00:00:00Z',
  place: 'test',
  center: { lat: 48.2, lng: 16.3 },
  bbox: { south: 48, west: 16, north: 49, east: 17 },
  totalRoads: 1,
};

const ROADS: OSMMapData = {
  meta: META,
  roads: [
    {
      id: 1,
      type: 'residential',
      name: 'Kärntner Straße',
      lanes: 2,
      width: 8,
      oneway: 1,
      access: 'yes',
      points: [
        { x: -100, z: 0 },
        { x: 0, z: 0 },
        { x: 100, z: 0 },
      ],
    },
  ],
};

describe('inspectPoint', () => {
  it('reports a road with zero lateral offset on its centre line', () => {
    const track = createTrack(ROADS);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 20, 0);
    expect(report.road).not.toBeNull();
    expect(report.road!.name).toBe('Kärntner Straße');
    expect(report.road!.width).toBe(8);
    expect(report.road!.lateral).toBeCloseTo(0, 5);
  });

  it('reports the lateral offset 3 m away from the centre line', () => {
    const track = createTrack(ROADS);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 20, 3);
    expect(report.road!.lateral).toBeCloseTo(3, 5);
  });

  it('converts world coordinates to lat/lng via the map centre', () => {
    const track = createTrack(ROADS);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 0, 0);
    expect(report.lat).toBeCloseTo(META.center.lat, 6);
    expect(report.lng).toBeCloseTo(META.center.lng, 6);
  });
});

describe('inspectPoint junctions', () => {
  const PLUS: OSMMapData = {
    ...ROADS,
    roads: [
      {
        id: 1,
        type: 'residential',
        name: 'N road',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: 0, z: -50 },
          { x: 0, z: 0 },
        ],
      },
      {
        id: 2,
        type: 'residential',
        name: 'S road',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: 0, z: 0 },
          { x: 0, z: 50 },
        ],
      },
      {
        id: 3,
        type: 'residential',
        name: 'W road',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: -50, z: 0 },
          { x: 0, z: 0 },
        ],
      },
      {
        id: 4,
        type: 'residential',
        name: 'E road',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: 0, z: 0 },
          { x: 50, z: 0 },
        ],
      },
    ],
  };

  it('flags a four-way junction with four arms', () => {
    const track = createTrack(PLUS);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 0, 0);
    expect(report.node).not.toBeNull();
    expect(report.node!.junction).toBe(true);
    expect(report.node!.arms).toBe(4);
    expect(report.node!.distance).toBeCloseTo(0, 5);
  });

  it('does not flag an interior node of a single through-road', () => {
    const track = createTrack(ROADS);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 0, 0);
    expect(report.node!.junction).toBe(false);
    expect(report.node!.arms).toBe(2);
  });
});

describe('inspectPoint buildings', () => {
  const SQUARE: OSMMapData = {
    ...ROADS,
    buildings: [
      {
        id: 42,
        type: 'residential',
        name: '',
        points: [
          { x: 10, z: 10 },
          { x: 20, z: 10 },
          { x: 20, z: 20 },
          { x: 10, z: 20 },
          { x: 10, z: 10 },
        ],
      },
    ],
  };

  it('reports a point inside the building footprint', () => {
    const track = createTrack(SQUARE);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 15, 15);
    expect(report.building).not.toBeNull();
    expect(report.building!.id).toBe(42);
    expect(report.building!.inside).toBe(true);
    expect(report.building!.distance).toBe(0);
  });

  it('reports distance to a nearby building outside its footprint', () => {
    const track = createTrack(SQUARE);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 15, 30);
    expect(report.building).not.toBeNull();
    expect(report.building!.inside).toBe(false);
    expect(report.building!.distance).toBeCloseTo(10, 5);
  });

  it('omits the building beyond the lookup radius', () => {
    const track = createTrack(SQUARE);
    const graph = buildRoadGraph(track.roads);
    const report = inspectPoint(track, graph, 15, 200);
    expect(report.building).toBeNull();
  });
});

describe('formatReport', () => {
  const track = createTrack(ROADS);
  const graph = buildRoadGraph(track.roads);
  const report = inspectPoint(track, graph, 20, 0);
  const extras: ReportExtras = { hit: null, car: null, route: null, map: null };

  it('includes the pin, coordinates and lat/lng', () => {
    const text = formatReport(3, report, extras);
    expect(text).toContain('[pin 3]');
    expect(text).toContain('x=20.0 z=0.0');
    expect(text).toContain(String(META.center.lat.toFixed(6)));
  });

  it('omits the building line when there is no building', () => {
    const text = formatReport(1, report, extras);
    expect(text).not.toContain('building:');
  });

  it('omits the route line when there is no route', () => {
    const text = formatReport(1, report, extras);
    expect(text).not.toContain('route:');
  });

  it('adds the route line when a route is present', () => {
    const withRoute: ReportExtras = {
      ...extras,
      route: {
        street: 'Stephansplatz',
        remaining: 312,
        next: { maneuver: 'right', street: 'Graben', distance: 48 },
      },
    };
    const text = formatReport(1, report, withRoute);
    expect(text).toContain('route: to "Stephansplatz"');
    expect(text).toContain('312.0 m left');
    expect(text).toContain('next: right onto Graben in 48.0 m');
  });

  it('prints a normalised 0-359 heading even for a negative sin', () => {
    const withCar: ReportExtras = {
      ...extras,
      car: { position: { x: 0, z: 0 }, heading: -Math.PI / 4, speed: 0 },
    };
    const text = formatReport(1, report, withCar);
    expect(text).toContain('heading 315°');
  });

  it('adds the map line when map context is present', () => {
    const withMap: ReportExtras = {
      ...extras,
      map: 'openstreetmap generated 2026-01-01',
    };
    const text = formatReport(1, report, withMap);
    expect(text).toContain('map: openstreetmap generated 2026-01-01');
  });
});

describe('nearestRoadHeading', () => {
  it('points back along the nearest road segment', () => {
    const track = createTrack(ROADS);
    const heading = nearestRoadHeading(track, 25, 0);
    expect(-Math.sin(heading)).toBeCloseTo(1, 5);
    expect(-Math.cos(heading)).toBeCloseTo(0, 5);
  });

  it('faces the car along traffic on a one-way -1 road', () => {
    const BACK: OSMMapData = {
      meta: META,
      roads: [
        {
          id: 2,
          type: 'residential',
          name: 'Back',
          lanes: 2,
          width: 8,
          oneway: -1,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 100, z: 0 },
          ],
        },
      ],
    };
    const track = createTrack(BACK);
    const heading = nearestRoadHeading(track, 25, 0);
    expect(-Math.sin(heading)).toBeCloseTo(-1, 5);
    expect(-Math.cos(heading)).toBeCloseTo(0, 5);
  });
});