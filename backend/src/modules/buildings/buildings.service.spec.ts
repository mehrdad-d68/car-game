import { BuildingsService, mergeAssignments } from './buildings.service';
import { BUILDING_SPECS } from './data/building-specs';

describe('BuildingsService', () => {
  const service = new BuildingsService();

  it('returns the seed catalog', () => {
    const buildings = service.findAll();
    expect(buildings.length).toBeGreaterThanOrEqual(3);
    expect(
      buildings.every(
        (b) => b.id && b.name && b.category && b.footprint && b.height > 0 && b.parts.length >= 3,
      ),
    ).toBe(true);
  });

  it('offers at least ten designs with unique ids', () => {
    const buildings = service.findAll();
    expect(buildings.length).toBeGreaterThanOrEqual(10);
    expect(new Set(buildings.map((b) => b.id)).size).toBe(buildings.length);
  });

  it('keeps every part inside the footprint it claims', () => {
    for (const building of service.findAll()) {
      const halfWidth = building.footprint.width / 2 + 1;
      const halfDepth = building.footprint.depth / 2 + 1;
      for (const part of building.parts) {
        expect(Math.abs(part.position[0])).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(part.position[2])).toBeLessThanOrEqual(halfDepth);
      }
    }
  });

  it('describes every building with primitive parts', () => {
    for (const building of service.findAll()) {
      const body = building.parts.find((part) => part.name === 'body');
      expect(body).toBeDefined();
      expect(body!.size).toHaveLength(3);
      expect(body!.position).toHaveLength(3);
      expect(typeof body!.color).toBe('number');
      for (const part of building.parts) {
        expect(part.size.every((x) => x >= 0)).toBe(true);
      }
    }
  });

  it('returns a building by id', () => {
    const first = service.findAll()[0];
    expect(service.findOne(first.id)).toEqual(first);
  });

  it('returns undefined for an unknown id', () => {
    expect(service.findOne('nope')).toBeUndefined();
  });

  it('resolves no model path for a parts-only building', () => {
    const first = service.findAll()[0];
    expect(first.model).toBeUndefined();
    expect(service.getModelPath(first.id)).toBeUndefined();
    expect(service.getModelPath('nope')).toBeUndefined();
  });

  it('serves an assignment per claimed building', () => {
    const assignments = service.findAssignments();
    const ids = Object.keys(assignments);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(Number.isFinite(Number(id))).toBe(true);
    }
  });

  it('names only designs that exist in the catalog', () => {
    const specIds = new Set(BUILDING_SPECS.map((spec) => spec.id));
    const unknown = Object.entries(service.findAssignments())
      .filter(([, entry]) => entry.spec !== null && !specIds.has(entry.spec))
      .map(([id]) => id);
    expect(unknown).toEqual([]);
  });

  it('caches the assignments after the first read', () => {
    expect(service.findAssignments()).toBe(service.findAssignments());
  });
});

describe('mergeAssignments', () => {
  it('lets a hand-written override replace the generated design', () => {
    const merged = mergeAssignments(
      { '1': { spec: 'house' }, '2': { spec: 'shop' } },
      { '2': { spec: 'villa', yaw: 1.5 } },
    );
    expect(merged['1']).toEqual({ spec: 'house' });
    expect(merged['2']).toEqual({ spec: 'villa', yaw: 1.5 });
  });

  it('lets an override add a building the generator never claimed', () => {
    const merged = mergeAssignments({}, { '99': { spec: 'garage' } });
    expect(merged['99']).toEqual({ spec: 'garage' });
  });

  it('lets a null override take a building back to the generated path', () => {
    const merged = mergeAssignments({ '7': { spec: 'house' } }, { '7': { spec: null } });
    expect(merged['7'].spec).toBeNull();
  });

  it('leaves the inputs untouched', () => {
    const generated = { '1': { spec: 'house' } };
    const overrides = { '1': { spec: 'villa' } };
    mergeAssignments(generated, overrides);
    expect(generated['1'].spec).toBe('house');
    expect(overrides['1'].spec).toBe('villa');
  });
});
