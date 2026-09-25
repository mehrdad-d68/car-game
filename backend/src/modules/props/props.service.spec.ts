import { PropsService } from './props.service';
import { MAP_ITEM_KINDS } from '../map/osm-types';

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
    expect(service.findOne('busStop')!.footprint).toEqual({
      width: 8,
      depth: 6,
    });
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

  it('has no model entries yet, so no kind resolves a model path', () => {
    for (const kind of MAP_ITEM_KINDS) {
      expect(service.findOne(kind)!.model).toBeUndefined();
      expect(service.getModelPath(kind)).toBeUndefined();
    }
  });
});
