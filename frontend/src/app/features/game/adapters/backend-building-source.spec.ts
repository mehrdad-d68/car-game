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
import { Observable } from 'rxjs';
import { BackendBuildingSource } from './backend-building-source';
import { BuildingAssignments, BuildingSpec } from '../engine/sim/building-spec';

const A_BUILDING: BuildingSpec = {
  id: 'house',
  name: 'House',
  category: 'house',
  footprint: { width: 8, depth: 12, tolerance: 2.5 },
  height: 5,
  floors: 1,
  parts: [],
};

function setup(): {
  controller: HttpTestingController;
  create: () => BackendBuildingSource;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpClient);
  const destroyRef = TestBed.inject(DestroyRef);
  const controller = TestBed.inject(HttpTestingController);
  return {
    controller,
    create: () => new BackendBuildingSource(http, destroyRef),
  };
}

describe('BackendBuildingSource', () => {
  it('resolves with the building catalog from /api/buildings', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadBuildings();
    const req = controller.expectOne('/api/buildings');
    expect(req.request.method).toBe('GET');

    req.flush([A_BUILDING]);

    const buildings = await promise;
    expect(buildings).toHaveLength(1);
    expect(buildings[0].id).toBe('house');
  });

  it('rejects when the building request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadBuildings();
    controller.expectOne('/api/buildings').error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });

  it('resolves with placements from /api/buildings/placements', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadPlacements();
    const req = controller.expectOne('/api/buildings/placements');
    expect(req.request.method).toBe('GET');

    req.flush([{ specId: 'house', x: 1, z: 2, yaw: 0.5 }]);

    const placements = await promise;
    expect(placements).toHaveLength(1);
    expect(placements[0].specId).toBe('house');
  });

  it('rejects when the placements request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadPlacements();
    controller
      .expectOne('/api/buildings/placements')
      .error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });

  it('resolves with assignments from /api/buildings/assignments', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadAssignments();
    const req = controller.expectOne('/api/buildings/assignments');
    expect(req.request.method).toBe('GET');

    req.flush({ '42': { spec: 'house' } });

    const assignments = await promise;
    expect(assignments['42']).toEqual({ spec: 'house' });
  });

  it('rejects when the assignments request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadAssignments();
    controller
      .expectOne('/api/buildings/assignments')
      .error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });

  it('rejects when the owning scope is destroyed before the request answers', async () => {
    const handlers: (() => void)[] = [];
    const destroyRef = {
      onDestroy: (callback: () => void) => handlers.push(callback),
    } as unknown as DestroyRef;
    const http = {
      get: () => new Observable<BuildingAssignments>(() => undefined),
    } as unknown as HttpClient;
    const source = new BackendBuildingSource(http, destroyRef);

    const promise = source.loadAssignments();
    for (const handler of handlers) handler();

    await expect(promise).rejects.toThrow(/disposed/);
  });
});