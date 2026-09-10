import { OSMMapData } from './osm-types';
import { createTrack } from './track';

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
});