import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TrackSource } from '../engine/ports';
import { OSMMapData } from '../engine/sim/osm-types';
import { createTrack, TrackData } from '../engine/sim/track';

const MAP_URL = '/api/map';

export class BackendTrackSource implements TrackSource {
  constructor(
    private readonly http: HttpClient,
    private readonly destroyRef: DestroyRef,
  ) {}

  loadTrack(): Promise<TrackData> {
    return new Promise<TrackData>((resolve, reject) => {
      this.http
        .get<OSMMapData>(MAP_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => resolve(createTrack(data)),
          error: (err) => reject(err),
        });
    });
  }
}
