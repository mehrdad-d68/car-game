import * as THREE from 'three';
import { MapItemKind, OSMMapData } from '../sim/osm-types';
import { PropSpec } from '../sim/prop-spec';
import { createTrack } from '../sim/track';
import { loadPresentModels, presentPropKinds } from './prop-models';

const DATA: OSMMapData = {
  meta: {
    source: 'openstreetmap',
    generatedAt: '2026-01-01T00:00:00Z',
    place: 'test',
    center: { lat: 48.145, lng: 16.29 },
    bbox: { south: 48.13, west: 16.25, north: 48.16, east: 16.33 },
    totalRoads: 1,
  },
  roads: [
    {
      id: 1,
      type: 'primary',
      name: 'Street A',
      lanes: 2,
      width: 12,
      oneway: 0,
      access: 'yes',
      points: [
        { x: -200, z: 0 },
        { x: 200, z: 0 },
      ],
    },
  ],
  items: [
    { kind: 'trafficLight', id: 1, x: 0, z: 0 },
    { kind: 'gasStation', id: 2, x: 100, z: 100, name: 'Shell' },
  ],
};

describe('presentPropKinds', () => {
  it('yields only the kinds that appear in the track', () => {
    const kinds = presentPropKinds(createTrack(DATA));
    expect(kinds.has('trafficLight')).toBe(true);
    expect(kinds.has('gasStation')).toBe(true);
    expect(kinds.has('busStop')).toBe(false);
    expect(kinds.has('hospital')).toBe(false);
  });

  it('yields nothing for an empty track', () => {
    expect(presentPropKinds(createTrack({ ...DATA, items: [] })).size).toBe(0);
  });
});

describe('loadPresentModels', () => {
  const specs: PropSpec[] = [
    {
      kind: 'trafficLight',
      name: 'Traffic light',
      variants: [{ id: 'pole', parts: [{ name: 'pole', size: [0.2, 4.2, 0.2], position: [0, 2.1, 0], color: 0x455a64 }] }],
    },
    {
      kind: 'gasStation',
      name: 'Gas station',
      variants: [{ id: 'default', parts: [{ name: 'canopy', size: [8, 0.3, 6], position: [0, 3.15, 0], color: 0xfdd835 }] }],
      model: { url: '/api/props/gasStation/model', targetLength: 8, yawOffset: 0 },
    },
    {
      kind: 'hospital',
      name: 'Hospital',
      variants: [{ id: 'default', parts: [{ name: 'building', size: [10, 5, 8], position: [0, 2.5, 0], color: 0xfafafa }] }],
      model: { url: '/api/props/hospital/model', targetLength: 10, yawOffset: 0 },
    },
  ];

  it('loads a model only for kinds present in the track', async () => {
    const loader = vi.fn(async () => new THREE.Group());
    const present = new Set<MapItemKind>(['trafficLight', 'gasStation']);

    const models = await loadPresentModels(specs, present, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(specs[1].model);
    expect(models.has('gasStation')).toBe(true);
    expect(models.has('hospital')).toBe(false);
  });

  it('skips kinds whose spec has no model', async () => {
    const loader = vi.fn(async () => new THREE.Group());
    const present = new Set<MapItemKind>(['trafficLight', 'gasStation']);

    await loadPresentModels(specs, present, loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('tolerates a loader failure and omits that kind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = vi.fn(async () => {
      throw new Error('boom');
    });

    const models = await loadPresentModels(
      specs,
      new Set<MapItemKind>(['gasStation']),
      loader,
    );

    expect(models.size).toBe(0);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});