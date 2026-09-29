import { existsSync } from 'node:fs';
import { PropsService } from './props.service';
import { MAP_ITEM_KINDS } from '../map/osm-types';
import { PROP_MODELS } from './data/prop-models';

describe('PropsService', () => {
  const service = new PropsService();

  it('returns one spec per map item kind', () => {
    const props = service.findAll();
    expect(props.length).toBe(MAP_ITEM_KINDS.length);
    for (const kind of MAP_ITEM_KINDS) {
      expect(props.some((prop) => prop.kind === kind)).toBe(true);
    }
  });

  it('gives every spec a name and at least one variant with parts', () => {
    for (const prop of service.findAll()) {
      expect(prop.name).toBeTruthy();
      if (prop.kind === 'busStop') continue;
      expect(prop.variants.length).toBeGreaterThan(0);
      for (const variant of prop.variants) {
        expect(variant.id).toBeTruthy();
        expect(variant.parts.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries a signal variant for every mount and colour', () => {
    const traffic = service.findOne('trafficLight')!;
    expect(traffic.variants.map((v) => v.id).sort()).toEqual([
      'overhead-amber',
      'overhead-green',
      'overhead-red',
      'pole-amber',
      'pole-green',
      'pole-red',
    ]);
  });

  it('returns a spec by kind', () => {
    const first = service.findAll()[0];
    expect(service.findOne(first.kind)).toEqual(first);
  });

  it('returns undefined for an unknown kind', () => {
    expect(service.findOne('nope')).toBeUndefined();
  });

  it('exposes a footprint for scaled kinds', () => {
    expect(service.findOne('gasStation')!.footprint).toEqual({
      width: 8,
      depth: 6,
    });
    expect(service.findOne('fireStation')!.footprint).toEqual({
      width: 10,
      depth: 8,
    });
    expect(service.findOne('hospital')!.footprint).toEqual({
      width: 10,
      depth: 8,
    });
    expect(service.findOne('policeStation')!.footprint).toEqual({
      width: 10,
      depth: 8,
    });
  });

  it('attaches a model to the police station and resolves its path', () => {
    const police = service.findOne('policeStation')!;
    expect(police.model).toEqual({
      url: '/api/props/policeStation/model',
      targetLength: 25.1,
      yawOffset: 0,
    });
    expect(service.getModelPath('policeStation')).toContain(
      'police-station.glb',
    );
  });

  it('attaches a model to the bus stop and resolves its path', () => {
    const bus = service.findOne('busStop')!;
    expect(bus.model).toEqual({
      url: '/api/props/busStop/model',
      targetLength: 12,
      yawOffset: 0,
    });
    expect(service.getModelPath('busStop')).toContain('bus-station.glb');
  });

  it('points every model at a file that exists on disk', () => {
    for (const kind of Object.keys(PROP_MODELS)) {
      expect(existsSync(service.getModelPath(kind)!)).toBe(true);
    }
  });

  it('leaves every other kind without a model', () => {
    for (const kind of MAP_ITEM_KINDS) {
      if (kind === 'policeStation' || kind === 'busStop') continue;
      expect(service.findOne(kind)!.model).toBeUndefined();
      expect(service.getModelPath(kind)).toBeUndefined();
    }
  });
});
