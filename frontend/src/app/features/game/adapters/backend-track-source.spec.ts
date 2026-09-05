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
import { BackendTrackSource } from './backend-track-source';
import { OSMMapData } from '../engine/sim/osm-types';

function setup(): {
  controller: HttpTestingController;
  create: () => BackendTrackSource;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpClient);
  const destroyRef = TestBed.inject(DestroyRef);
  const controller = TestBed.inject(HttpTestingController);
  return {
    controller,
    create: () => new BackendTrackSource(http, destroyRef),
  };
}

describe('BackendTrackSource', () => {
  it('resolves with a TrackData built from the /api/map payload', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadTrack();
    const req = controller.expectOne('/api/map');
    expect(req.request.method).toBe('GET');

    const payload: OSMMapData = {
      meta: {
        source: 't',
        generatedAt: 'now',
        place: 'vienna',
        center: { lat: 0, lng: 0 },
        bbox: { south: 0, west: 0, north: 0, east: 0 },
        totalRoads: 1,
      },
      roads: [
        {
          id: 1,
          type: 'service',
          name: 'Testweg',
          lanes: 1,
          width: 6,
          oneway: 0,
          access: 'private',
          points: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
          ],
        },
      ],
    };
    req.flush(payload);

    const track = await promise;
    expect(track.roads).toHaveLength(1);
    expect(track.roads[0].name).toBe('Testweg');
  });

  it('rejects when the request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadTrack();
    controller.expectOne('/api/map').error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });
});
