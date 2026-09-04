import * as THREE from 'three';
import { OSMMapData } from '../sim/osm-types';
import { createTrack } from '../sim/track';
import { TrackView } from './track-view';

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

    it('skips roads narrower than 10', () => {
      const track = createTrack(SAMPLE_DATA);
      const view = new TrackView(track);
      view.buildLabels();
      const labelMeshes = view.group.children.filter(
        (c) => c.name === '',
      );
      expect(labelMeshes).toHaveLength(0);
    });
  });
});
