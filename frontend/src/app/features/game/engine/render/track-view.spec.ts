import * as THREE from 'three';
import { OSMMapData } from '../sim/osm-types';
import { createTrack, findJunctions, TrackData } from '../sim/track';
import { cumulativeDistances, metresToUv } from './road-textures';
import { SURFACE_OFFSET } from './constants';
import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import {
  directionArrowRotationY,
  filterArrowsByJunctions,
  planBarriers,
  planDirectionArrows,
  planSidewalkCuts,
  planStreetLabels,
  TrackView,
} from './track-view';

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
  it('builds one ground mesh and one batched mesh per road class', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const ground = view.group.children.filter((c) => c.name === 'ground');
    expect(ground).toHaveLength(1);

    const roadMeshes = view.group.children.filter((c) =>
      c.name.startsWith('roads-'),
    );
    expect(roadMeshes).toHaveLength(2);
  });

  it('has no lane-dash children', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const dashes = view.group.children.filter((c) => c.name === 'lane-dash');
    expect(dashes).toHaveLength(0);
  });

  it('lays the ground flat with a world-space bounding box matching the track bounds', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const groundMesh = view.group.children.find((c) => c.name === 'ground') as THREE.Mesh;
    expect(groundMesh).toBeDefined();

    const box = new THREE.Box3().setFromObject(groundMesh);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(0, 5);
    expect(box.min.x).toBeCloseTo(track.bounds.minX, 4);
    expect(box.max.x).toBeCloseTo(track.bounds.maxX, 4);
    expect(box.min.z).toBeCloseTo(track.bounds.minZ, 4);
    expect(box.max.z).toBeCloseTo(track.bounds.maxZ, 4);
  });

  it('maps ground UVs to world-space metres', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const groundMesh = view.group.children.find((c) => c.name === 'ground') as THREE.Mesh;
    expect(groundMesh).toBeDefined();
    const geo = (groundMesh as THREE.Mesh).geometry;
    const uvs = geo.getAttribute('uv') as THREE.BufferAttribute;
    const positions = geo.getAttribute('position') as THREE.BufferAttribute;
    expect(uvs).toBeDefined();
    expect(uvs.count).toBe(4);

    const { bounds } = track;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    for (let i = 0; i < uvs.count; i++) {
      const wx = centerX + positions.getX(i);
      const wz = centerZ - positions.getY(i);
      expect(uvs.getX(i)).toBeCloseTo(metresToUv(wx), 4);
      expect(uvs.getY(i)).toBeCloseTo(metresToUv(wz), 4);
    }
  });

  it('uses repeat-wrapped textures on road materials', () => {
    const road = createTrack(SAMPLE_DATA).roads[0];
    expect(road).toBeDefined();
    const view = new TrackView(createTrack(SAMPLE_DATA));
    const major = view.group.children.find((c) => c.name === 'roads-major');
    expect(major).toBeDefined();
    const mat = (major as THREE.Mesh).material as THREE.MeshLambertMaterial;
    expect(mat.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(mat.map?.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('lays road vertices flat on the ground plane', () => {
    const track = createTrack(SAMPLE_DATA);
    const view = new TrackView(track);

    const road = view.group.children.find((c) => c.name.startsWith('roads-'));
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
      c.name.startsWith('roads-'),
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
      c.name.startsWith('roads-'),
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

    it('merges segments of the same street into a single label run', () => {
      const plans = planStreetLabels(createTrack(DATA));
      expect(plans.filter((p) => p.name === 'Gregorygasse')).toHaveLength(3);
    });

    it('spreads repeated labels along the whole merged street', () => {
      const plans = planStreetLabels(createTrack(DATA))
        .filter((p) => p.name === 'Gregorygasse')
        .sort((a, b) => a.position.x - b.position.x);
      expect(plans[0].position.x).toBeCloseTo(33.333, 1);
      expect(plans[1].position.x).toBeCloseTo(100, 1);
      expect(plans[2].position.x).toBeCloseTo(166.667, 1);
      expect(plans.every((p) => Math.abs(p.position.z) < 1e-6)).toBe(true);
    });

    it('labels every named road regardless of size', () => {
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

  describe('road geometry attributes', () => {
    it('exposes marking attributes on road meshes', () => {
      const track = createTrack(SAMPLE_DATA);
      const view = new TrackView(track);

      const road = view.group.children.find((c) =>
        c.name.startsWith('roads-'),
      ) as THREE.Mesh;
      const maskAttr = road.geometry.getAttribute('aMarkingMask') as THREE.BufferAttribute;
      const styleAttr = road.geometry.getAttribute('aMarkingStyle') as THREE.BufferAttribute;
      const acrossAttr = road.geometry.getAttribute('aMarkingAcross') as THREE.BufferAttribute;
      const widthAttr = road.geometry.getAttribute('aMarkingWidth') as THREE.BufferAttribute;
      const lanesAttr = road.geometry.getAttribute('aMarkingLanes') as THREE.BufferAttribute;
      const sAttr = road.geometry.getAttribute('aMarkingS') as THREE.BufferAttribute;
      const aAttr = road.geometry.getAttribute('aMarkingA') as THREE.BufferAttribute;

      expect(maskAttr).toBeDefined();
      expect(styleAttr).toBeDefined();
      expect(acrossAttr).toBeDefined();
      expect(widthAttr).toBeDefined();
      expect(lanesAttr).toBeDefined();
      expect(sAttr).toBeDefined();
      expect(aAttr).toBeDefined();
      expect(maskAttr.count).toBeGreaterThan(0);
      expect(sAttr.count).toBe(maskAttr.count);
      expect(aAttr.count).toBe(maskAttr.count);
    });

    it('sets the fragment-fade attributes next to a shared junction', () => {
      const junctionRoads: OSMMapData['roads'] = [
        {
          id: 1,
          type: 'residential',
          name: 'N',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 0, z: -50 },
          ],
        },
        {
          id: 2,
          type: 'residential',
          name: 'S',
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
          id: 3,
          type: 'residential',
          name: 'E',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 50, z: 0 },
          ],
        },
      ];
      const view = new TrackView(createTrack({ ...SAMPLE_DATA, roads: junctionRoads }));
      const mesh = view.group.children.find((c) =>
        c.name.startsWith('roads-'),
      ) as THREE.Mesh;
      const sAttr = mesh.geometry.getAttribute('aMarkingS') as THREE.BufferAttribute;
      const aAttr = mesh.geometry.getAttribute('aMarkingA') as THREE.BufferAttribute;
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

      let sawNear = false;
      let sawFar = false;
      for (let i = 0; i < sAttr.count; i++) {
        const d = Math.hypot(pos.getX(i), pos.getZ(i));
        if (d < 6 && Math.abs(sAttr.getX(i)) < 1e-3) sawNear = true;
        if (d > 40 && sAttr.getX(i) > 40) sawFar = true;
      }
      expect(sawNear).toBe(true);
      expect(sawFar).toBe(true);
    });

    it('puts the marking across coordinate at the lane edges', () => {
      const road = SAMPLE_DATA.roads.find((r) => r.width === 12)!;
      const track = createTrack({
        ...SAMPLE_DATA,
        roads: [road],
      });
      const view = new TrackView(track);

      const mesh = view.group.children.find((c) =>
        c.name.startsWith('roads-'),
      ) as THREE.Mesh;
      const across = mesh.geometry.getAttribute('aMarkingAcross') as THREE.BufferAttribute;
      const width = mesh.geometry.getAttribute('aMarkingWidth') as THREE.BufferAttribute;

      const half = width.getX(0) / 2;
      let sawLeft = false;
      let sawRight = false;
      for (let i = 0; i < across.count; i++) {
        if (Math.abs(across.getX(i) + half) < 1e-4) sawLeft = true;
        if (Math.abs(across.getX(i) - half) < 1e-4) sawRight = true;
      }
      expect(sawLeft).toBe(true);
      expect(sawRight).toBe(true);
    });

    it('sets mask to 0 near a shared junction and 1 away from it', () => {
      const junctionRoads: OSMMapData['roads'] = [
        {
          id: 1,
          type: 'residential',
          name: 'N',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 0, z: -50 },
          ],
        },
        {
          id: 2,
          type: 'residential',
          name: 'S',
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
          name: 'E',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: -50, z: 0 },
          ],
        },
      ];
      const track = createTrack({
        ...SAMPLE_DATA,
        roads: junctionRoads,
      });
      const view = new TrackView(track);
      const mesh = view.group.children.find((c) =>
        c.name.startsWith('roads-'),
      ) as THREE.Mesh;
      const maskAttr = mesh.geometry.getAttribute('aMarkingMask') as THREE.BufferAttribute;
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

      const { radius } = findJunctions(junctionRoads.map((r) => ({
        name: r.name,
        type: r.type,
        lanes: r.lanes,
        width: r.width,
        oneway: r.oneway,
        access: r.access,
        points: r.points,
      })))[0];
      let nearZero = false;
      let nearOne = false;
      for (let i = 0; i < maskAttr.count; i++) {
        const d = Math.hypot(pos.getX(i), pos.getZ(i));
        if (d <= radius + 2) {
          if (maskAttr.getX(i) < 1e-4) nearZero = true;
        }
        if (d >= radius + 5) {
          if (Math.abs(maskAttr.getX(i) - 1) < 1e-4) nearOne = true;
        }
      }
      expect(nearZero).toBe(true);
      expect(nearOne).toBe(true);
    });
  });

  describe('sidewalks and kerbs', () => {
    const SIDEWALK_TOP = 0.55;

    function trackWith(roads: OSMMapData['roads']): TrackData {
      return createTrack({
        meta: {
          source: 'openstreetmap',
          generatedAt: '2026-01-01T00:00:00Z',
          place: 'test',
          center: { lat: 0, lng: 0 },
          bbox: { south: 0, west: 0, north: 1, east: 1 },
          totalRoads: roads.length,
        },
        roads,
      });
    }

    it('keeps every sidewalk vertex at the raised walk height', () => {
      const view = new TrackView(createTrack(SAMPLE_DATA));
      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      expect(sw).toBeDefined();
      const pos = sw.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i++) {
        expect(pos.getY(i)).toBeCloseTo(SIDEWALK_TOP, 5);
      }
    });

    it('places sidewalk tops in the inner/outer bands on a straight road', () => {
      const primary = SAMPLE_DATA.roads.find((r) => r.width === 12)!;
      const view = new TrackView(trackWith([primary]));
      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      const pos = sw.geometry.getAttribute('position') as THREE.BufferAttribute;
      const swW = Math.min(2.5, 12 * 0.3);
      let sawInner = false;
      let sawOuter = false;
      for (let i = 0; i < pos.count; i++) {
        const az = Math.abs(pos.getZ(i));
        if (Math.abs(az - 6) < 1e-3) sawInner = true;
        if (Math.abs(az - (6 + swW)) < 1e-3) sawOuter = true;
      }
      expect(sawInner).toBe(true);
      expect(sawOuter).toBe(true);
    });

    it('cuts sidewalk triangles inside a junction radius', () => {
      const roads: OSMMapData['roads'] = [
        {
          id: 1,
          type: 'primary',
          name: 'A',
          lanes: 2,
          width: 12,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: -50, z: 0 },
          ],
        },
        {
          id: 2,
          type: 'primary',
          name: 'B',
          lanes: 2,
          width: 12,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 50, z: 0 },
          ],
        },
        {
          id: 3,
          type: 'primary',
          name: 'C',
          lanes: 2,
          width: 12,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 0, z: 50 },
          ],
        },
      ];
      const view = new TrackView(trackWith(roads));
      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      const pos = sw.geometry.getAttribute('position') as THREE.BufferAttribute;
      const index = sw.geometry.getIndex() as THREE.BufferAttribute;
      expect(index).toBeDefined();

      const { radius } = findJunctions(
        roads.map((r) => ({
          name: r.name,
          type: r.type,
          lanes: r.lanes,
          width: r.width,
          oneway: r.oneway,
          access: r.access,
          points: r.points,
        })),
      )[0];

      for (let i = 0; i < index.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i));
        expect(Math.hypot(v.x, v.z)).toBeGreaterThanOrEqual(radius - 0.02);
      }
    });

    it('builds kerb step and drop faces beside the sidewalk', () => {
      const primary = SAMPLE_DATA.roads.find((r) => r.width === 12)!;
      const view = new TrackView(trackWith([primary]));
      const kerb = view.group.children.find((c) => c.name === 'kerbs') as THREE.Mesh;
      const pos = kerb.geometry.getAttribute('position') as THREE.BufferAttribute;
      let sawRoadLevel = false;
      let sawWalkLevel = false;
      let sawGround = false;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (Math.abs(y - 0.4) < 1e-4) sawRoadLevel = true;
        if (Math.abs(y - SIDEWALK_TOP) < 1e-4) sawWalkLevel = true;
        if (Math.abs(y) < 1e-4) sawGround = true;
      }
      expect(sawRoadLevel).toBe(true);
      expect(sawWalkLevel).toBe(true);
      expect(sawGround).toBe(true);
    });

    it('does not build sidewalks for service roads', () => {
      const roads: OSMMapData['roads'] = [
        {
          id: 1,
          type: 'service',
          name: '',
          lanes: 1,
          width: 4,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 40, z: 0 },
          ],
        },
      ];
      const view = new TrackView(trackWith(roads));
      const sw = view.group.children.filter((c) => c.name === 'sidewalks');
      expect(sw).toHaveLength(0);
      const kerb = view.group.children.filter((c) => c.name === 'kerbs');
      expect(kerb).toHaveLength(1);
    });

    function osmRoad(
      id: number,
      type: string,
      width: number,
      points: [number, number][],
    ): OSMMapData['roads'][number] {
      return {
        id,
        type,
        name: `R${id}`,
        lanes: 2,
        width,
        oneway: 0,
        access: 'yes',
        points: points.map(([x, z]) => ({ x, z })),
      };
    }

    describe('planSidewalkCuts', () => {
      function cutsFor(roads: OSMMapData['roads']) {
        const track = trackWith(roads);
        const cuts = planSidewalkCuts(track.roads);
        return track.roads.map((r) => cuts.get(r) ?? []);
      }

      it('cuts a through road only on the side the side road joins', () => {
        const [through, side] = cutsFor([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0], [50, 0]]),
          osmRoad(2, 'residential', 8, [[0, 0], [0, 50]]),
        ]);
        expect(through).toHaveLength(1);
        expect(through[0].side).toBe('left');
        expect(through[0].start).toBeCloseTo(46, 5);
        expect(through[0].end).toBeCloseTo(54, 5);

        expect(side.map((c) => c.side).sort()).toEqual(['left', 'right']);
        for (const cut of side) {
          expect(cut.start).toBeCloseTo(0, 5);
          expect(cut.end).toBeCloseTo(8.5, 5);
        }
      });

      it('does not cut two roads that simply continue each other', () => {
        const cuts = cutsFor([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0]]),
          osmRoad(2, 'primary', 12, [[0, 0], [50, 0]]),
        ]);
        expect(cuts.flat()).toHaveLength(0);
      });

      it('cuts both sides of both roads where two through roads cross', () => {
        const [wide, narrow] = cutsFor([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0], [50, 0]]),
          osmRoad(2, 'residential', 8, [[0, -50], [0, 0], [0, 50]]),
        ]);
        expect(wide.map((c) => c.side).sort()).toEqual(['left', 'right']);
        for (const cut of wide) {
          expect(cut.start).toBeCloseTo(46, 5);
          expect(cut.end).toBeCloseTo(54, 5);
        }
        expect(narrow.map((c) => c.side).sort()).toEqual(['left', 'right']);
        for (const cut of narrow) {
          expect(cut.start).toBeCloseTo(41.5, 5);
          expect(cut.end).toBeCloseTo(58.5, 5);
        }
      });

      it('moves and widens the gap to where an angled side road crosses the sidewalk', () => {
        const [through] = cutsFor([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0], [50, 0]]),
          osmRoad(2, 'residential', 8, [[0, 0], [40, 40]]),
        ]);
        expect(through).toHaveLength(1);
        expect(through[0].side).toBe('left');
        expect(through[0].start).toBeCloseTo(50 + 6 - 4 * Math.SQRT2, 5);
        expect(through[0].end).toBeCloseTo(50 + 8.5 + 4 * Math.SQRT2, 5);
      });
    });

    it('cuts sidewalks at a T junction without dropping the far side or the side road', () => {
      const view = new TrackView(
        trackWith([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0], [50, 0]]),
          osmRoad(2, 'residential', 8, [[0, 0], [0, 50]]),
        ]),
      );
      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      const pos = sw.geometry.getAttribute('position');
      const index = sw.geometry.getIndex()!;

      let farSideReachesFromLeft = false;
      let farSideReachesFromRight = false;
      let sideRoadHasSidewalk = false;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const xs = ids.map((k) => pos.getX(k));
        const zs = ids.map((k) => pos.getZ(k));
        const cx = xs.reduce((a, b) => a + b, 0) / 3;
        const cz = zs.reduce((a, b) => a + b, 0) / 3;

        expect(Math.abs(cz) < 6 - 0.01).toBe(false);
        expect(cz > 0 && Math.abs(cx) < 4 - 0.01).toBe(false);

        if (cz < -6 && Math.min(...xs) < -1 && Math.max(...xs) >= 0) farSideReachesFromLeft = true;
        if (cz < -6 && Math.max(...xs) > 1 && Math.min(...xs) <= 0) farSideReachesFromRight = true;
        if (cz > 20) sideRoadHasSidewalk = true;
      }
      expect(farSideReachesFromLeft).toBe(true);
      expect(farSideReachesFromRight).toBe(true);
      expect(sideRoadHasSidewalk).toBe(true);
    });

    function sidewalkCovers(view: TrackView, x: number, z: number): boolean {
      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      const pos = sw.geometry.getAttribute('position');
      const index = sw.geometry.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)].map((k) => ({
          x: pos.getX(k),
          z: pos.getZ(k),
        }));
        const d1 = (x - b.x) * (a.z - b.z) - (a.x - b.x) * (z - b.z);
        const d2 = (x - c.x) * (b.z - c.z) - (b.x - c.x) * (z - c.z);
        const d3 = (x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) return true;
      }
      return false;
    }

    it('keeps sidewalks off both roads where a side road joins at 45 degrees', () => {
      const view = new TrackView(
        trackWith([
          osmRoad(1, 'primary', 12, [[-50, 0], [0, 0], [50, 0]]),
          osmRoad(2, 'residential', 8, [[0, 0], [40, 40]]),
        ]),
      );

      const covered: string[] = [];
      for (let along = 0; along <= 20; along += 0.5) {
        for (let across = -3.5; across <= 3.5; across += 0.5) {
          const x = (along - across) / Math.SQRT2;
          const z = (along + across) / Math.SQRT2;
          if (sidewalkCovers(view, x, z)) covered.push(`side(${along},${across})`);
        }
      }
      for (let x = -20; x <= 20; x += 0.5) {
        for (let z = -5.5; z <= 5.5; z += 0.5) {
          if (sidewalkCovers(view, x, z)) covered.push(`through(${x},${z})`);
        }
      }
      expect(covered.length, covered.slice(0, 8).join(' ')).toBe(0);
    });
  });

  describe('texture colour space', () => {
    it('marks road, sidewalk and junction textures as sRGB', () => {
      const view = new TrackView(createTrack(SAMPLE_DATA));
      const road = view.group.children.find((c) =>
        c.name.startsWith('roads-'),
      ) as THREE.Mesh;
      expect(
        ((road.material as THREE.MeshLambertMaterial).map?.colorSpace)
      ).toBe(THREE.SRGBColorSpace);

      const sw = view.group.children.find((c) => c.name === 'sidewalks') as THREE.Mesh;
      expect(sw).toBeDefined();
      expect(
        ((sw.material as THREE.MeshLambertMaterial).map?.colorSpace)
      ).toBe(THREE.SRGBColorSpace);
    });
  });

  describe('cumulativeDistances', () => {
    it('is exact on a straight line', () => {
      expect(
        cumulativeDistances([
          { x: 0, z: 0 },
          { x: 30, z: 0 },
          { x: 30, z: 40 },
        ]),
      ).toEqual([0, 30, 70]);
    });

    it('accumulates around an L-bend', () => {
      const dist = cumulativeDistances([
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
        { x: 10, z: 20 },
      ]);
      expect(dist[0]).toBe(0);
      expect(dist[1]).toBeCloseTo(10, 9);
      expect(dist[2]).toBeCloseTo(20, 9);
      expect(dist[3]).toBeCloseTo(30, 9);
    });

    it('keeps zero-length segments at the same distance', () => {
      const dist = cumulativeDistances([
        { x: 0, z: 0 },
        { x: 5, z: 0 },
        { x: 5, z: 0 },
        { x: 5, z: 10 },
      ]);
      expect(dist[1]).toBe(5);
      expect(dist[2]).toBe(5);
      expect(dist[3]).toBe(15);
    });

    it('handles a single point', () => {
      expect(cumulativeDistances([{ x: 1, z: 2 }])).toEqual([0]);
    });
  });

  describe('filterArrowsByJunctions', () => {
    it('keeps arrows that are not inside any junction', () => {
      const plans = [
        { x: 0, z: 500, phi: 0, kind: 'forward' as const },
        { x: 0, z: 600, phi: 0, kind: 'reverse' as const },
      ];
      const kept = filterArrowsByJunctions(plans, [
        { position: { x: 0, z: 0 }, roadCount: 3, radius: 20 },
      ]);
      expect(kept).toHaveLength(2);
    });

    it('drops arrows inside a junction radius', () => {
      const plans = [
        { x: 0, z: 0, phi: 0, kind: 'forward' as const },
        { x: 10, z: 0, phi: 0, kind: 'forward' as const },
        { x: 500, z: 0, phi: 0, kind: 'forward' as const },
      ];
      const kept = filterArrowsByJunctions(plans, [
        { position: { x: 0, z: 0 }, roadCount: 4, radius: 30 },
      ]);
      expect(kept).toHaveLength(1);
      expect(kept[0].x).toBe(500);
    });

    it('returns all plans when there are no junctions', () => {
      const plans = [{ x: 0, z: 0, phi: 0, kind: 'forward' as const }];
      expect(filterArrowsByJunctions(plans, [])).toHaveLength(1);
    });
  });

  describe('junction patches', () => {
    function crossRoads(): OSMMapData {
      return {
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
            type: 'primary',
            name: 'A',
            lanes: 2,
            width: 12,
            oneway: 0,
            access: 'yes',
            points: [
              { x: -100, z: 0 },
              { x: 0, z: 0 },
            ],
          },
          {
            id: 2,
            type: 'primary',
            name: 'B',
            lanes: 2,
            width: 12,
            oneway: 0,
            access: 'yes',
            points: [
              { x: 100, z: 0 },
              { x: 0, z: 0 },
            ],
          },
          {
            id: 3,
            type: 'primary',
            name: 'C',
            lanes: 2,
            width: 12,
            oneway: 0,
            access: 'yes',
            points: [
              { x: 0, z: -100 },
              { x: 0, z: 0 },
            ],
          },
          {
            id: 4,
            type: 'primary',
            name: 'D',
            lanes: 2,
            width: 12,
            oneway: 0,
            access: 'yes',
            points: [
              { x: 0, z: 100 },
              { x: 0, z: 0 },
            ],
          },
        ],
      };
    }

    it('emits a junction patch when 4 roads meet', () => {
      const view = new TrackView(createTrack(crossRoads()));
      const patches = view.group.children.filter(
        (c) => c.name === 'junction-patch',
      );
      expect(patches.length).toBeGreaterThan(0);

      const mesh = patches[0] as THREE.Mesh;
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const index = mesh.geometry.getIndex() as THREE.BufferAttribute;
      expect(index.count % 3).toBe(0);
      expect(pos.count).toBeGreaterThan(3);

      const normal = (mesh.geometry.getAttribute('normal') as THREE.BufferAttribute);
      for (let i = 0; i < normal.count; i++) {
        expect(normal.getY(i)).toBeCloseTo(1, 5);
      }
    });

    it('does not emit a junction patch for a simple two-road way split', () => {
      const data = crossRoads();
      data.roads = data.roads.slice(0, 2);
      const view = new TrackView(createTrack(data));
      const patches = view.group.children.filter(
        (c) => c.name === 'junction-patch',
      );
      expect(patches).toHaveLength(0);
    });

    it('uses the widest meeting road class as the patch texture', () => {
      const view = new TrackView(createTrack(crossRoads()));
      const patches = view.group.children.filter(
        (c) => c.name === 'junction-patch',
      ) as THREE.Mesh[];
      expect(patches).toHaveLength(1);

      const road = view.group.children.find((c) =>
        c.name === 'roads-major',
      ) as THREE.Mesh;
      const patchMap = (patches[0].material as THREE.MeshLambertMaterial).map;
      const roadMap = (road.material as THREE.MeshLambertMaterial).map;
      expect(patchMap).toBe(roadMap);
    });
  });
});

describe('TrackView at full map scale', () => {
  it('builds the whole Vienna map without throwing', () => {
    const track = createTrack(viennaData as unknown as OSMMapData);
    expect(() => new TrackView(track)).not.toThrow();
  });

  it('keeps merged kerb and sidewalk triangles on their own road', () => {
    const data: OSMMapData = {
      ...SAMPLE_DATA,
      roads: [
        {
          id: 1,
          type: 'primary',
          name: 'Major',
          lanes: 2,
          width: 12,
          oneway: 0,
          access: 'yes',
          points: [{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 100, z: 0 }],
        },
        {
          id: 2,
          type: 'residential',
          name: 'Street',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [{ x: 0, z: 1000 }, { x: 50, z: 1000 }, { x: 100, z: 1000 }],
        },
      ],
    };
    const view = new TrackView(createTrack(data));

    for (const name of ['kerbs', 'sidewalks']) {
      const mesh = view.group.children.find((c) => c.name === name) as THREE.Mesh;
      expect(mesh).toBeDefined();
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getIndex()!;
      let onStreet = 0;
      for (let i = 0; i < index.count; i += 3) {
        const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        expect(Math.max(...corners)).toBeLessThan(position.count);
        const zs = corners.map((c) => position.getZ(c));
        expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(50);
        if (Math.min(...zs) > 900) onStreet++;
      }
      expect(onStreet).toBeGreaterThan(0);
    }
  });
});

describe('road surface depth offsets', () => {
  it('keeps every offset road surface behind the road decal offset', () => {
    const view = new TrackView(createTrack(SAMPLE_DATA));
    let checked = 0;
    view.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material.polygonOffset) continue;
        checked++;
        expect(material.polygonOffsetFactor).toBeGreaterThan(SURFACE_OFFSET.decal);
        expect(material.polygonOffsetUnits).toBeGreaterThan(SURFACE_OFFSET.decal);
      }
    });
    expect(checked).toBeGreaterThan(0);
  });
});
