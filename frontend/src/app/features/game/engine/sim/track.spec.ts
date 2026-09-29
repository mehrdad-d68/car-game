import { OSMBuilding, OSMMapData } from './osm-types';
import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import {
  createTrack,
  findJunctions,
  JunctionGrid,
  markingPattern,
  nearestRoadPoint,
  PolylineRoad,
  projectOntoRoad,
  roadClass,
  snapYawTo,
} from './track';

const SAMPLE_DATA: OSMMapData = {
  meta: {
    source: 'openstreetmap',
    generatedAt: '2026-01-01T00:00:00Z',
    place: 'test',
    center: { lat: 0, lng: 0 },
    bbox: { south: 0, west: 0, north: 1, east: 1 },
    totalRoads: 3,
  },
  roads: [
    {
      id: 1,
      type: 'primary',
      name: 'Road A',
      lanes: 2,
      width: 12,
      oneway: 1,
      access: 'yes',
      points: [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
        { x: 200, z: 50 },
      ],
    },
    {
      id: 2,
      type: 'residential',
      name: 'Road B',
      lanes: 1,
      width: 6,
      oneway: 0,
      access: 'yes',
      points: [
        { x: 50, z: -100 },
        { x: 50, z: 100 },
      ],
    },
    {
      id: 3,
      type: 'service',
      name: 'Dead end',
      lanes: 1,
      width: 4,
      oneway: 1,
      access: 'private',
      points: [{ x: 0, z: 0 }],
    },
  ],
};

function rectangle(
  id: number,
  x: number,
  z: number,
  width: number,
  depth: number,
): OSMBuilding {
  return {
    id,
    type: 'public',
    name: 'Gebaeude',
    levels: 4,
    points: [
      { x, z },
      { x: x + width, z },
      { x: x + width, z: z + depth },
      { x, z: z + depth },
      { x, z },
    ],
  };
}

describe('createTrack', () => {
  it('filters out roads with fewer than 2 points', () => {
    const track = createTrack(SAMPLE_DATA);
    expect(track.roads).toHaveLength(2);
  });

  it('quantizes road widths to the nearest bucket', () => {
    const track = createTrack(SAMPLE_DATA);
    const widths = track.roads.map((r) => r.width);
    expect(widths).toContain(12);
    expect(widths).toContain(6);
  });

  it('computes bounds covering all road points with padding', () => {
    const track = createTrack(SAMPLE_DATA);
    expect(track.bounds.minX).toBeLessThanOrEqual(0);
    expect(track.bounds.maxX).toBeGreaterThanOrEqual(200);
    expect(track.bounds.minZ).toBeLessThanOrEqual(-100);
    expect(track.bounds.maxZ).toBeGreaterThanOrEqual(100);
  });

  it('preserves road point data', () => {
    const track = createTrack(SAMPLE_DATA);
    const roadA = track.roads.find((r) => r.width === 12);
    expect(roadA).toBeDefined();
    expect(roadA!.points).toHaveLength(3);
    expect(roadA!.points[0]).toEqual({ x: 0, z: 0 });
    expect(roadA!.points[2]).toEqual({ x: 200, z: 50 });
  });

  it('preserves the access field through createTrack', () => {
    const track = createTrack(SAMPLE_DATA);
    const residential = track.roads.find((r) => r.name === 'Road B');
    expect(residential).toBeDefined();
    expect(residential!.access).toBe('yes');
  });

  it('spawns on a major road, not the narrow residential road', () => {
    const track = createTrack(SAMPLE_DATA);
    expect(track.spawn.position).toEqual({ x: 0, z: 0 });
  });

  it('spawn heading points along the chosen segment', () => {
    const major = SAMPLE_DATA.roads.find((r) => r.width >= 12)!;
    const from = major.points[0];
    const to = major.points[1];
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const fwd = {
      x: (to.x - from.x) / len,
      z: (to.z - from.z) / len,
    };

    const track = createTrack(SAMPLE_DATA);
    const { heading } = track.spawn;
    expect(-Math.sin(heading)).toBeCloseTo(fwd.x, 5);
    expect(-Math.cos(heading)).toBeCloseTo(fwd.z, 5);
  });

  it('falls back to the map origin when there are no roads', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      roads: [],
    });
    expect(track.spawn).toEqual({ position: { x: 0, z: 0 }, heading: 0 });
  });

  it('spawns on the road vertex closest to a police station', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'policeStation', id: 9, x: 190, z: 45, name: 'Polizei' }],
    });
    expect(track.spawn.position).toEqual({ x: 100, z: 0 });
  });

  it('spawns within 100m of a police station on the real map', () => {
    const track = createTrack(viennaData as never);
    expect(track.features.policeStations.length).toBeGreaterThan(0);
    const distances = track.features.policeStations.map((station) =>
      Math.hypot(
        track.spawn.position.x - station.position.x,
        track.spawn.position.z - station.position.z,
      ),
    );
    expect(Math.min(...distances)).toBeLessThan(100);
  });

  it('uses traffic light x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'trafficLight', id: 1, x: 74.28, z: -111.32 }],
    });
    expect(track.features.trafficLights).toHaveLength(1);
    const light = track.features.trafficLights[0];
    expect(light.id).toBe(1);
    expect(light.position).toEqual({ x: 74.28, z: -111.32 });
  });

  it('uses pedestrian crossing x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'pedestrianCrossing', id: 7, x: 150, z: 111.32 }],
    });
    expect(track.features.pedestrianCrossings).toHaveLength(1);
    expect(track.features.pedestrianCrossings[0].position).toEqual({
      x: 150,
      z: 111.32,
    });
  });

  it('preserves public transport stop names, types, and world coordinates', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 3, x: 123, z: -456, name: 'Central', type: 'platform' },
      ],
    });
    expect(track.features.publicTransportStops).toHaveLength(1);
    const stop = track.features.publicTransportStops[0];
    expect(stop.name).toBe('Central');
    expect(stop.type).toBe('platform');
    expect(stop.position).toEqual({ x: 123, z: -456 });
  });

  it('drops a stop_position that duplicates a nearby platform', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 1, x: 0, z: 0, name: 'Central', type: 'platform' },
        { kind: 'busStop', id: 2, x: 10, z: 0, name: 'Central', type: 'stop_position' },
      ],
    });

    const stops = track.features.publicTransportStops;
    expect(stops).toHaveLength(1);
    expect(stops[0].type).toBe('platform');
  });

  it('keeps a stop_position that has no platform near it', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 1, x: 0, z: 0, name: 'Central', type: 'platform' },
        { kind: 'busStop', id: 2, x: 1000, z: 0, name: 'Far Away', type: 'stop_position' },
      ],
    });

    const stops = track.features.publicTransportStops;
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.type).sort()).toEqual(['platform', 'stop_position']);
  });

  it('collapses a cluster of stop_positions that have no platform', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 1, x: 0, z: 0, name: 'Depot', type: 'stop_position' },
        { kind: 'busStop', id: 2, x: 10, z: 0, name: 'Depot', type: 'stop_position' },
        { kind: 'busStop', id: 3, x: 20, z: 0, name: 'Depot', type: 'stop_position' },
      ],
    });

    expect(track.features.publicTransportStops).toHaveLength(1);
  });

  it('never drops a platform even when two sit close together', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 1, x: 0, z: 0, name: 'A', type: 'platform' },
        { kind: 'busStop', id: 2, x: 5, z: 0, name: 'B', type: 'platform' },
      ],
    });

    expect(track.features.publicTransportStops).toHaveLength(2);
  });

  it('defaults feature lists to empty when the map has no items', () => {
    const track = createTrack(SAMPLE_DATA);
    expect(track.features.trafficLights).toEqual([]);
    expect(track.features.pedestrianCrossings).toEqual([]);
    expect(track.features.publicTransportStops).toEqual([]);
    expect(track.features.gasStations).toEqual([]);
    expect(track.features.fireStations).toEqual([]);
    expect(track.features.hospitals).toEqual([]);
    expect(track.features.policeStations).toEqual([]);
  });

  it('uses gas station x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'gasStation', id: 1, x: 74.28, z: -111.32, name: 'Shell' }],
    });
    expect(track.features.gasStations).toHaveLength(1);
    const station = track.features.gasStations[0];
    expect(station.id).toBe(1);
    expect(station.name).toBe('Shell');
    expect(station.position).toEqual({ x: 74.28, z: -111.32 });
  });

  it('uses fire station x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'fireStation', id: 2, x: 100, z: 111.32, name: 'Feuerwehr' }],
    });
    expect(track.features.fireStations).toHaveLength(1);
    expect(track.features.fireStations[0].position).toEqual({ x: 100, z: 111.32 });
  });

  it('uses hospital x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'hospital', id: 3, x: -50, z: 25, name: 'AKH' }],
    });
    expect(track.features.hospitals).toHaveLength(1);
    expect(track.features.hospitals[0].position).toEqual({ x: -50, z: 25 });
  });

  it('uses police station x/z as world coordinates directly', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'policeStation', id: 4, x: 2000, z: -2000, name: 'Polizei' }],
    });
    expect(track.features.policeStations).toHaveLength(1);
    expect(track.features.policeStations[0].position).toEqual({
      x: 2000,
      z: -2000,
    });
  });

  it('splits mixed items into the right feature lists', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'trafficLight', id: 1, x: 0, z: 0 },
        { kind: 'busStop', id: 2, x: 10, z: 0, name: 'Stop', type: 'platform' },
        { kind: 'gasStation', id: 3, x: 20, z: 0, name: 'BP' },
        { kind: 'fireStation', id: 4, x: 30, z: 0, name: 'Wache 1' },
        { kind: 'hospital', id: 5, x: 40, z: 0, name: 'Allgemeines Krankenhaus' },
        { kind: 'policeStation', id: 6, x: 50, z: 0, name: 'Landespolizeidirektion' },
      ],
    });
    expect(track.features.trafficLights).toHaveLength(1);
    expect(track.features.pedestrianCrossings).toHaveLength(0);
    expect(track.features.publicTransportStops).toHaveLength(1);
    expect(track.features.gasStations[0].name).toBe('BP');
    expect(track.features.fireStations[0].name).toBe('Wache 1');
    expect(track.features.hospitals[0].name).toBe('Allgemeines Krankenhaus');
    expect(track.features.policeStations[0].name).toBe('Landespolizeidirektion');
  });

  it('carries optional footprint dimensions through for stations and stops', () => {
    const track = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'gasStation', id: 1, x: 0, z: 0, name: 'Shell', width: 30, depth: 20, area: 500 },
        {
          kind: 'busStop',
          id: 2,
          x: 5,
          z: 5,
          name: 'Endach',
          type: 'platform',
          width: 22,
          depth: 4,
        },
        { kind: 'gasStation', id: 3, x: 50, z: 50, name: 'BP' },
      ],
    });
    const station = track.features.gasStations[0];
    expect(station.width).toBe(30);
    expect(station.depth).toBe(20);
    expect(station.area).toBe(500);
    const stop = track.features.publicTransportStops[0];
    expect(stop.width).toBe(22);
    expect(stop.depth).toBe(4);
    expect(track.features.gasStations[1].width).toBeUndefined();
  });

  it('carries type and lanes through createTrack', () => {
    const track = createTrack(SAMPLE_DATA);
    const roadA = track.roads.find((r) => r.name === 'Road A');
    expect(roadA).toBeDefined();
    expect(roadA!.type).toBe('primary');
    expect(roadA!.lanes).toBe(2);
    const roadB = track.roads.find((r) => r.name === 'Road B');
    expect(roadB).toBeDefined();
    expect(roadB!.type).toBe('residential');
    expect(roadB!.lanes).toBe(1);
  });

  describe('roadClass', () => {
    it('classifies motorway as major', () => {
      expect(roadClass('motorway')).toBe('major');
    });

    it('classifies primary as major', () => {
      expect(roadClass('primary')).toBe('major');
    });

    it('classifies secondary as major', () => {
      expect(roadClass('secondary')).toBe('major');
    });

    it('classifies tertiary as major', () => {
      expect(roadClass('tertiary')).toBe('major');
    });

    it('classifies motorway_link as major', () => {
      expect(roadClass('motorway_link')).toBe('major');
    });

    it('classifies residential as street', () => {
      expect(roadClass('residential')).toBe('street');
    });

    it('classifies unclassified as street', () => {
      expect(roadClass('unclassified')).toBe('street');
    });

    it('classifies service as service', () => {
      expect(roadClass('service')).toBe('service');
    });

    it('classifies living_street as shared', () => {
      expect(roadClass('living_street')).toBe('shared');
    });

    it('falls back to street for unknown types', () => {
      expect(roadClass('bogus')).toBe('street');
    });

    it('is case-insensitive', () => {
      expect(roadClass('PRIMARY')).toBe('major');
      expect(roadClass('Service')).toBe('service');
    });
  });

  describe('findJunctions', () => {
    function road(
      id: number,
      type: string,
      points: { x: number; z: number }[],
    ): PolylineRoad {
      return {
        name: String(id),
        type,
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points,
      };
    }

    it('detects a T junction (3 roads sharing a node)', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(3, 'residential', [
          { x: 0, z: 100 },
          { x: 0, z: 0 },
        ]),
      ]);
      expect(junctions).toHaveLength(1);
      expect(junctions[0].roadCount).toBe(3);
      expect(junctions[0].position.x).toBeCloseTo(0, 1);
      expect(junctions[0].position.z).toBeCloseTo(0, 1);
    });

    it('detects a cross junction (4 roads sharing a node)', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(3, 'residential', [
          { x: 0, z: 100 },
          { x: 0, z: 0 },
        ]),
        road(4, 'residential', [
          { x: 0, z: -100 },
          { x: 0, z: 0 },
        ]),
      ]);
      expect(junctions).toHaveLength(1);
      expect(junctions[0].roadCount).toBe(4);
    });

    it('does not treat a two-road way split as a junction', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ]),
      ]);
      expect(junctions).toHaveLength(0);
    });

    it('ignores roads that pass without sharing a node', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 100, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 0, z: -100 },
          { x: 0, z: 100 },
        ]),
      ]);
      expect(junctions).toHaveLength(0);
    });

    it('sets radius from the widest meeting road', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 100, z: 0 },
          { x: 0, z: 0 },
        ]),
        { ...road(3, 'residential', [{ x: 0, z: 100 }, { x: 0, z: 0 }]), width: 24 },
      ]);
      expect(junctions).toHaveLength(1);
      expect(junctions[0].radius).toBe(12);
    });

    it('is empty when no roads meet', () => {
      expect(findJunctions([road(1, 'residential', [{ x: 0, z: 0 }, { x: 10, z: 0 }])])).toEqual([]);
    });

    it('detects a T junction where one road passes through', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 0, z: -100 },
          { x: 0, z: 0 },
        ]),
      ]);
      expect(junctions).toHaveLength(1);
      expect(junctions[0].roadCount).toBe(3);
      expect(junctions[0].position.x).toBeCloseTo(0, 1);
      expect(junctions[0].position.z).toBeCloseTo(0, 1);
    });

    it('detects a crossing where both roads pass through', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 0, z: -100 },
          { x: 0, z: 0 },
          { x: 0, z: 100 },
        ]),
      ]);
      expect(junctions).toHaveLength(1);
      expect(junctions[0].roadCount).toBe(4);
    });

    it('keeps a two-road way split out even with a through segment', () => {
      const junctions = findJunctions([
        road(1, 'residential', [
          { x: -100, z: 0 },
          { x: 0, z: 0 },
        ]),
        road(2, 'residential', [
          { x: 0, z: 0 },
          { x: 0, z: 100 },
          { x: 0, z: 200 },
        ]),
      ]);
      expect(junctions).toHaveLength(0);
    });
  });

  describe('JunctionGrid', () => {
    it('finds junctions near a point and far ones not at all', () => {
      const grid = new JunctionGrid([
        { position: { x: 0, z: 0 }, roadCount: 3, radius: 6 },
        { position: { x: 1000, z: 1000 }, roadCount: 3, radius: 6 },
      ]);
      expect(grid.near(10, 10, 50)).toHaveLength(1);
      expect(grid.near(10, 10, 50)[0].position).toEqual({ x: 0, z: 0 });
      expect(grid.near(990, 990, 50)).toHaveLength(1);
      expect(grid.near(500, 500, 10)).toHaveLength(0);
    });

    it('finds junctions inside a bounding box (nearBBox)', () => {
      const grid = new JunctionGrid([
        { position: { x: 10, z: 10 }, roadCount: 3, radius: 6 },
        { position: { x: -10, z: -10 }, roadCount: 3, radius: 6 },
      ]);
      expect(grid.nearBBox(-20, 20, -20, 20)).toHaveLength(2);
      expect(grid.nearBBox(0, 100, 0, 100)).toHaveLength(1);
      expect(grid.nearBBox(500, 600, 500, 600)).toHaveLength(0);
    });

    it('is empty when there are no junctions', () => {
      const grid = new JunctionGrid([]);
      expect(grid.near(0, 0, 100)).toHaveLength(0);
      expect(grid.nearBBox(0, 100, 0, 100)).toHaveLength(0);
    });
  });

  describe('projectOntoRoad', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 30, z: 0 },
      { x: 30, z: 40 },
    ];

    it('is along 0 at the start of the road', () => {
      expect(projectOntoRoad(pts, { x: 0, z: 0 }).along).toBe(0);
    });

    it('measures distance along the polyline', () => {
      expect(projectOntoRoad(pts, { x: 30, z: 40 }).along).toBeCloseTo(70, 6);
      expect(projectOntoRoad(pts, { x: 15, z: 0 }).along).toBeCloseTo(15, 6);
    });

    it('projects a point beside a segment onto it', () => {
      const { along, lateral } = projectOntoRoad(pts, { x: 5, z: 20 });
      expect(along).toBeCloseTo(5, 6);
      expect(lateral).toBeCloseTo(20, 6);
    });

    it('reports zero lateral distance for a point on the centreline', () => {
      const { along, lateral } = projectOntoRoad(pts, { x: 30, z: 20 });
      expect(along).toBeCloseTo(50, 6);
      expect(lateral).toBeCloseTo(0, 6);
    });
  });

  describe('nearestRoadPoint', () => {
    const roads = createTrack(SAMPLE_DATA).roads;

    it('finds the closest point on the closest road', () => {
      const near = nearestRoadPoint(50, 40, roads)!;
      expect(near.x).toBeCloseTo(50, 6);
      expect(near.z).toBeCloseTo(40, 6);
      expect(near.distance).toBeCloseTo(0, 6);
    });

    it('reports the tangent, width, and side of the road it picked', () => {
      const near = nearestRoadPoint(-50, 0, roads)!;
      expect(near.width).toBe(12);
      expect(near.tx).toBeCloseTo(1, 6);
      expect(near.tz).toBeCloseTo(0, 6);
      expect(near.cross).toBeCloseTo(0, 6);
      expect(near.distance).toBeCloseTo(50, 6);
    });

    it('clamps to the end of a road', () => {
      const near = nearestRoadPoint(-500, 0, roads)!;
      expect(near.x).toBeCloseTo(0, 6);
      expect(near.z).toBeCloseTo(0, 6);
    });

    it('is null when the map has no roads', () => {
      expect(nearestRoadPoint(0, 0, [])).toBeNull();
    });
  });

  describe('snapYawTo', () => {
    it('keeps a base yaw that already points at the target', () => {
      expect(snapYawTo(0, 0.3)).toBe(0);
    });

    it('flips the base yaw when the target is behind it', () => {
      expect(snapYawTo(0, Math.PI + 0.3)).toBeCloseTo(Math.PI, 6);
    });

    it('keeps the base yaw when the target is exactly side on', () => {
      expect(snapYawTo(0, Math.PI / 2)).toBe(0);
      expect(snapYawTo(0, -Math.PI / 2)).toBe(0);
    });

    it('never returns a yaw outside a half turn', () => {
      for (const base of [-3, -1, 0, 1, 3]) {
        for (const target of [-3, -0.5, 0, 0.5, 3]) {
          const snapped = snapYawTo(base, target);
          expect(snapped).toBeGreaterThan(-Math.PI);
          expect(snapped).toBeLessThanOrEqual(Math.PI);
        }
      }
    });
  });

  describe('markingPattern', () => {
    function roadWith(overrides: Partial<PolylineRoad>): PolylineRoad {
      return {
        name: '',
        type: 'residential',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        ...overrides,
      };
    }

    it('gives a two-way street a dashed centre line', () => {
      expect(markingPattern(roadWith({}))).toBe('two-way-dashed');
    });

    it('gives a two-way major road with 4+ lanes a double centre line', () => {
      expect(markingPattern(roadWith({ type: 'primary', lanes: 4 }))).toBe(
        'two-way-double',
      );
    });

    it('keeps two-way dashed for a major road with few lanes', () => {
      expect(markingPattern(roadWith({ type: 'primary', lanes: 2 }))).toBe(
        'two-way-dashed',
      );
    });

    it('gives a one-way road the one-way pattern', () => {
      expect(markingPattern(roadWith({ oneway: 1 }))).toBe('one-way');
      expect(markingPattern(roadWith({ oneway: -1, type: 'primary' }))).toBe('one-way');
    });

    it('gives service roads no markings', () => {
      expect(markingPattern(roadWith({ type: 'service' }))).toBe('none');
      expect(markingPattern(roadWith({ type: 'service', oneway: 1 }))).toBe('none');
    });

    it('gives living streets no markings', () => {
      expect(markingPattern(roadWith({ type: 'living_street' }))).toBe('none');
    });
  });

  describe('station placement', () => {
    const WIDE = rectangle(50, 0, 0, 40, 20);
    const TALL = rectangle(51, 0, 60, 20, 40);

    const DATA_WITH_BUILDINGS: OSMMapData = {
      ...SAMPLE_DATA,
      buildings: [WIDE, TALL],
      items: [
        { kind: 'policeStation', id: 50, x: -900, z: -900, name: 'Wache' },
        { kind: 'hospital', id: 51, x: -900, z: -900, name: 'Klinik' },
        { kind: 'gasStation', id: 99, x: -50, z: 0, name: 'BP' },
      ],
    };

    it('links a station to the OSM building that shares its id', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      expect(track.features.policeStations[0].buildingId).toBe(50);
      expect(track.features.hospitals[0].buildingId).toBe(51);
    });

    it('leaves a station with no matching building unlinked', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      expect(track.features.gasStations[0].buildingId).toBeUndefined();
    });

    it('centres a building station on its roof frame, not the item point', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      expect(track.features.policeStations[0].position).toEqual({ x: 20, z: 10 });
      expect(track.features.hospitals[0].position).toEqual({ x: 10, z: 80 });
    });

    it('runs the station model along the long side of its building', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      const wide = track.features.policeStations[0].yaw!;
      const tall = track.features.hospitals[0].yaw!;
      expect(Math.sin(wide)).toBeCloseTo(0, 6);
      expect(Math.cos(tall)).toBeCloseTo(0, 6);
    });

    it('turns a building station to face the nearest road', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      expect(track.features.policeStations[0].yaw).toBeCloseTo(Math.PI, 6);
      expect(track.features.hospitals[0].yaw).toBeCloseTo(Math.PI / 2, 6);
    });

    it('faces a point-only station at the nearest road', () => {
      const track = createTrack(DATA_WITH_BUILDINGS);
      const station = track.features.gasStations[0];
      expect(station.position).toEqual({ x: -50, z: 0 });
      expect(station.yaw).toBeCloseTo(Math.PI / 2, 6);
    });

    it('leaves a station with no road anywhere facing world +Z', () => {
      const track = createTrack({
        ...SAMPLE_DATA,
        roads: [],
        buildings: [WIDE],
        items: [{ kind: 'policeStation', id: 50, x: 0, z: 0, name: 'Wache' }],
      });
      expect(track.features.policeStations[0].yaw).toBeCloseTo(0, 6);
    });

    it('links the Liesing police station to its building on the real map', () => {
      const track = createTrack(viennaData as never);
      const liesing = track.features.policeStations.find(
        (station) => station.name === 'Polizeikommissariat Liesing',
      )!;
      expect(liesing.buildingId).toBe(141423603);
      expect(track.buildings.some((b) => b.id === liesing.buildingId)).toBe(true);

      const pointOnly = track.features.policeStations.find(
        (station) => station.name === 'Polizeiinspektion Anton-Baumgartner-Straße',
      )!;
      expect(pointOnly.buildingId).toBeUndefined();
    });
  });

  describe('createTrack buildings', () => {
    it('is empty when the map has no buildings', () => {
      expect(createTrack(SAMPLE_DATA).buildings).toEqual([]);
    });

    it('builds records from the real map', () => {
      const track = createTrack(viennaData as never);
      expect(track.buildings.length).toBeGreaterThan(19000);
      expect(track.buildings.every((b) => b.points.length >= 3)).toBe(true);
      expect(track.buildings.every((b) => b.height > 0)).toBe(true);
      expect([...new Set(track.buildings.map((b) => b.style))].sort()).toEqual([
        'apartment',
        'home',
        'hut',
        'shop',
        'works',
      ]);
    });
  });
});