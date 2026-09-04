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
});
