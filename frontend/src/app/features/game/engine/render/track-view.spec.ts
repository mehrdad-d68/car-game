import * as THREE from 'three';
import { OSMMapData } from '../sim/osm-types';
import { createTrack } from '../sim/track';
import { directionArrowRotationY, planBarriers, planDirectionArrows, planStreetLabels, TrackView } from './track-view';

const SAMPLE_DATA: OSMMapData = {
  meta: {
    source: 'openstreetmap',
    generatedAt: '2026-01-01T00:00:00Z',
    place: 'test',
    center: { lat: 0, lng: 0 },
    bbox: { south: 0, west: 0, north: 1, east: 1 },
    totalRoads: 2,
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
      ],
    },
    {
      id: 2,
      type: 'residential',
      name: 'Road B',
      lanes: 1,
      width: 8,
      oneway: 0,
      access: 'yes',
      points: [
        { x: 50, z: -50 },
        { x: 50, z: 50 },
      ],
    },
  ],
};

describe('TrackView', () => {
  it('builds one ground mesh and one batched mesh per width bucket', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const ground = view.group.children.filter((c) => c.name === 'ground');
    expect(ground).toHaveLength(1);

    const roadMeshes = view.group.children.filter((c) =>
      c.name.startsWith('roads-w'),
    );
    expect(roadMeshes).toHaveLength(2);
  });

  it('has no lane-dash children', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const dashes = view.group.children.filter((c) => c.name === 'lane-dash');
    expect(dashes).toHaveLength(0);
  });

  it('lays road vertices flat on the ground plane', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const road = view.group.children.find((c) => c.name.startsWith('roads-w'));
    expect(road).toBeDefined();

    const mesh = road as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i++) {
      expect(position.getY(i)).toBeCloseTo(0.4, 5);
    }
  });

  it('faces every road triangle upward', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const mesh = view.group.children.find((c) =>
      c.name.startsWith('roads-w'),
    ) as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = mesh.geometry.getIndex() as THREE.BufferAttribute;

    expect(index).toBeDefined();
    for (let i = 0; i < index.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i));
      const b = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 1));
      const c = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 2));
      const normal = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
      expect(normal.y).toBeGreaterThan(0);
    }
  });

  it('uses a constant upward normal for all road vertices', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const mesh = view.group.children.find((c) =>
      c.name.startsWith('roads-w'),
    ) as THREE.Mesh;
    const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;

    expect(normal).toBeDefined();
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getX(i)).toBe(0);
      expect(normal.getY(i)).toBe(1);
      expect(normal.getZ(i)).toBe(0);
    }
  });

  describe('labels', () => {
    it('does not throw when canvas is unavailable (jsdom)', () => {
      const track = createTrack(SAMPLE_DATA);
      const view = new TrackView(track);
      expect(() => view.buildLabels()).not.toThrow();
      expect(() => view.updateLabels(50, 0)).not.toThrow();
    });

    it('builds no label meshes when canvas is unavailable (jsdom)', () => {
      const track = createTrack(SAMPLE_DATA);
      const view = new TrackView(track);
      view.buildLabels();
      const labelMeshes = view.group.children.filter(
        (c) => c.name === '',
      );
      expect(labelMeshes).toHaveLength(0);
    });
  });

  describe('planStreetLabels', () => {
    const DATA: OSMMapData = {
      meta: {
        source: 'openstreetmap',
        generatedAt: '2026-01-01T00:00:00Z',
        place: 'test',
        center: { lat: 0, lng: 0 },
        bbox: { south: 0, west: 0, north: 1, east: 1 },
        totalRoads: 4,
      },
      roads: [
        {
          id: 1,
          type: 'residential',
          name: 'Gregorygasse',
          lanes: 2,
          width: 7,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
          ],
        },
        {
          id: 2,
          type: 'residential',
          name: 'Gregorygasse',
          lanes: 2,
          width: 7,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 10, z: 0 },
            { x: 200, z: 0 },
          ],
        },
        {
          id: 3,
          type: 'service',
          name: 'Lane',
          lanes: 1,
          width: 4,
          oneway: 1,
          access: 'private',
          points: [
            { x: 0, z: 50 },
            { x: 5, z: 60 },
          ],
        },
        {
          id: 4,
          type: 'residential',
          name: 'Solo',
          lanes: 1,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 100 },
            { x: 20, z: 100 },
          ],
        },
      ],
    };

    it('includes a width-7 street that was previously excluded', () => {
      const plans = planStreetLabels(createTrack(DATA));
      expect(plans.some((p) => p.name === 'Gregorygasse')).toBe(true);
    });

    it('deduplicates a street split across segments into one label', () => {
      const plans = planStreetLabels(createTrack(DATA));
      expect(plans.filter((p) => p.name === 'Gregorygasse')).toHaveLength(1);
    });

    it('picks the longest segment for a split street', () => {
      const plans = planStreetLabels(createTrack(DATA));
      const gregory = plans.find((p) => p.name === 'Gregorygasse');
      expect(gregory).toBeDefined();
      expect(gregory!.road.points).toHaveLength(2);
      expect(gregory!.road.points[0].x).toBe(10);
      expect(gregory!.road.points[1].x).toBe(200);
    });

    it('plans a label for every named road (width quantizes to at least 6)', () => {
      const plans = planStreetLabels(createTrack(DATA));
      const names = plans.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(['Gregorygasse', 'Solo', 'Lane']));
    });
  });

  describe('planDirectionArrows', () => {
    function trackWith(roads: { oneway: 0 | 1 | -1; x1: number; z1: number; x2: number; z2: number }[]) {
      return createTrack({
        meta: {
          source: 'openstreetmap',
          generatedAt: '2026-01-01T00:00:00Z',
          place: 'test',
          center: { lat: 0, lng: 0 },
          bbox: { south: 0, west: 0, north: 1, east: 1 },
          totalRoads: roads.length,
        },
        roads: roads.map((r, idx) => ({
          id: idx + 1,
          type: 'residential',
          name: 'R' + idx,
          lanes: 1,
          width: 8,
          oneway: r.oneway as 0 | 1 | -1,
          access: 'yes',
          points: [
            { x: r.x1, z: r.z1 },
            { x: r.x2, z: r.z2 },
          ],
        })),
      });
    }

    it('renders two arrows for a two-way road (both directions)', () => {
      const track = trackWith([{ oneway: 0, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const plans = planDirectionArrows(track);

      expect(plans.some((p) => p.kind === 'forward')).toBe(true);
      expect(plans.some((p) => p.kind === 'reverse')).toBe(true);
      expect(plans).toHaveLength(2);
    });

    it('renders only a forward arrow for a one-way forward road', () => {
      const track = trackWith([{ oneway: 1, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const plans = planDirectionArrows(track);

      expect(plans).toHaveLength(1);
      expect(plans[0].kind).toBe('forward');
    });

    it('renders only a reverse arrow for a one-way reverse road', () => {
      const track = trackWith([{ oneway: -1, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const plans = planDirectionArrows(track);

      expect(plans).toHaveLength(1);
      expect(plans[0].kind).toBe('reverse');
    });

    it('points forward and reverse arrows in opposite directions', () => {
      const track = trackWith([{ oneway: 0, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const plans = planDirectionArrows(track);
      const forward = plans.find((p) => p.kind === 'forward')!;
      const reverse = plans.find((p) => p.kind === 'reverse')!;

      expect(Math.abs(reverse.phi - forward.phi)).toBeCloseTo(Math.PI, 5);
    });

    it('offsets the forward and reverse arrows to opposite lane sides', () => {
      const track = trackWith([{ oneway: 0, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const plans = planDirectionArrows(track);
      const forward = plans.find((p) => p.kind === 'forward')!;
      const reverse = plans.find((p) => p.kind === 'reverse')!;

      const dFx = forward.x - 0;
      const dFz = forward.z - 50;
      const dRx = reverse.x - 0;
      const dRz = reverse.z - 50;
      expect(dFx * dRx + dFz * dRz).toBeLessThan(0);
    });

    it('puts the forward arrow on the driver right side (right-hand traffic)', () => {
      const track = trackWith([{ oneway: 0, x1: 0, z1: 0, x2: 0, z2: 100 }]);
      const forward = planDirectionArrows(track).find((p) => p.kind === 'forward')!;

      const dFx = forward.x - 0;
      const dFz = forward.z - 50;
      expect(dFx).toBeCloseTo(-2.5, 5);
    });

    it('points the arrow tip along the travel direction', () => {
      const phi = 0;
      const rotation = new THREE.Object3D();
      rotation.rotation.set(-Math.PI / 2, 0, directionArrowRotationY(phi));
      rotation.updateMatrix();
      const tip = new THREE.Vector3(0, -1, 0).applyMatrix4(rotation.matrix);

      expect(tip.x).toBeCloseTo(Math.cos(phi), 5);
      expect(tip.z).toBeCloseTo(Math.sin(phi), 5);
    });
  });

  describe('planBarriers', () => {
    function barrierTrack() {
      return createTrack({
        meta: {
          source: 'openstreetmap',
          generatedAt: '2026-01-01T00:00:00Z',
          place: 'test',
          center: { lat: 0, lng: 0 },
          bbox: { south: 0, west: 0, north: 1, east: 1 },
          totalRoads: 2,
        },
        roads: [
          {
            id: 1,
            type: 'residential',
            name: 'Public St',
            lanes: 2,
            width: 8,
            oneway: 0,
            access: 'yes',
            points: [
              { x: 0, z: 0 },
              { x: 0, z: 100 },
            ],
          },
          {
            id: 2,
            type: 'service',
            name: '',
            lanes: 1,
            width: 6,
            oneway: 0,
            access: 'private',
            points: [
              { x: 0, z: 0 },
              { x: 8, z: 0 },
            ],
          },
        ],
      });
    }

    it('places no barriers when no road is private', () => {
      const track = barrierTrack();
      track.roads.forEach((r) => (r.access = 'yes'));
      expect(planBarriers(track)).toHaveLength(0);
    });

    it('blocks both entrances of a private driveway', () => {
      const plans = planBarriers(barrierTrack());
      expect(plans).toHaveLength(2);
      expect(plans.some((p) => p.x > 5)).toBe(true);
      expect(plans.some((p) => p.x < 5)).toBe(true);
      expect(plans.every((p) => p.z === 0)).toBe(true);
    });

    it('places a single barrier on a closed private loop', () => {
      const track = barrierTrack();
      const priv = track.roads.find((r) => r.access === 'private')!;
      priv.points = [
        { x: 0, z: 0 },
        { x: 4, z: 4 },
        { x: 8, z: 0 },
        { x: 0, z: 0 },
      ];
      expect(planBarriers(track)).toHaveLength(1);
    });

    it('renders a barrier via planBarriers through TrackView without throwing', () => {
      const view = new TrackView(barrierTrack());
      expect(() => view.buildLabels()).not.toThrow();
    });
  });
});
