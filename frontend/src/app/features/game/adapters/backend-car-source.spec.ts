import {
  HttpClient,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { BackendCarSource } from './backend-car-source';
import { CarSpec } from '../engine/sim/car-spec';

const A_CAR: CarSpec = {
  id: 'coupe',
  name: 'Coupe',
  handling: {
    enginePower: 18,
    turnRate: 2.4,
    steeringSpeed: 6,
    rollingResistance: 3.5,
    brakePower: 24,
    drag: 0.7,
    maxReverseSpeed: 8,
  },
  appearance: {
    body: { width: 1.8, height: 0.5, length: 3.6, color: 0xd32f2f, position: [0, 0.35, 0] },
    cabin: { width: 1.4, height: 0.45, length: 1.6, color: 0x90caf9, position: [0, 0.85, -0.2] },
    wheel: {
      radius: 0.32,
      width: 0.25,
      color: 0x212121,
      positions: [
        [-0.95, 0.32, 1.2],
        [0.95, 0.32, 1.2],
        [-0.95, 0.32, -1.2],
        [0.95, 0.32, -1.2],
      ],
    },
    headlight: {
      width: 0.3,
      height: 0.15,
      length: 0.05,
      color: 0xfff9c4,
      emissive: 0xffff99,
      emissiveIntensity: 0.6,
      positions: [
        [-0.5, 0.35, 1.7],
        [0.5, 0.35, 1.7],
      ],
    },
    taillight: {
      width: 0.3,
      height: 0.15,
      length: 0.05,
      color: 0xff5252,
      emissive: 0xff0000,
      emissiveIntensity: 0.4,
      positions: [
        [-0.5, 0.35, -1.7],
        [0.5, 0.35, -1.7],
      ],
    },
  },
};

function setup(): {
  controller: HttpTestingController;
  create: () => BackendCarSource;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpClient);
  const destroyRef = TestBed.inject(DestroyRef);
  const controller = TestBed.inject(HttpTestingController);
  return {
    controller,
    create: () => new BackendCarSource(http, destroyRef),
  };
}

describe('BackendCarSource', () => {
  it('resolves with the car catalog from /api/cars', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadCars();
    const req = controller.expectOne('/api/cars');
    expect(req.request.method).toBe('GET');

    req.flush([A_CAR]);

    const cars = await promise;
    expect(cars).toHaveLength(1);
    expect(cars[0].id).toBe('coupe');
  });

  it('rejects when the request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadCars();
    controller.expectOne('/api/cars').error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });

  it('prefixes model urls with the configured api url', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadCars();
    const req = controller.expectOne('/api/cars');
    req.flush([
      {
        ...A_CAR,
        model: { url: '/api/cars/coupe/model', targetLength: 4, yawOffset: 0 },
      },
    ]);

    const cars = await promise;
    expect(cars[0].model?.url).toBe(`${environment.apiUrl}/api/cars/coupe/model`);
  });
});
