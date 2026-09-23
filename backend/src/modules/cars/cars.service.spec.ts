import { CarsService } from './cars.service';

describe('CarsService', () => {
  const service = new CarsService();

  it('returns the seed catalog', () => {
    const cars = service.findAll();
    expect(cars.length).toBeGreaterThanOrEqual(2);
    expect(
      cars.every((c) => c.id && c.name && c.handling && c.appearance),
    ).toBe(true);
  });

  it('returns a car by id', () => {
    const first = service.findAll()[0];
    expect(service.findOne(first.id)).toEqual(first);
  });

  it('returns undefined for an unknown id', () => {
    expect(service.findOne('nope')).toBeUndefined();
  });

  it('attaches a model to cars that have one', () => {
    const coupe = service.findOne('coupe')!;
    expect(coupe.model).toBeDefined();
    expect(coupe.model!.url).toBe('/api/cars/coupe/model');
  });

  it('carries the per-model target length and yaw offset', () => {
    const coupe = service.findOne('coupe')!;
    expect(coupe.model!.targetLength).toBeCloseTo(3.6);
    expect(coupe.model!.yawOffset).toBeCloseTo(Math.PI);
  });

  it('leaves cars without a model unchanged', () => {
    expect(service.findOne('sport')!.model).toBeUndefined();
    expect(service.findOne('truck')!.model).toBeUndefined();
  });

  it('resolves a model path for a car with a model', () => {
    const path = service.getModelPath('coupe');
    expect(path).toBeDefined();
    expect(path!.endsWith('ergoninane-fast-72.glb')).toBe(true);
  });

  it('returns undefined for a car with no model', () => {
    expect(service.getModelPath('sport')).toBeUndefined();
    expect(service.getModelPath('nope')).toBeUndefined();
  });
});
