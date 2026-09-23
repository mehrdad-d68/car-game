import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BuildingSource } from '../engine/ports';
import { BuildingAssignments, BuildingPlacement, BuildingSpec } from '../engine/sim/building-spec';

const BUILDINGS_URL = '/api/buildings';
const PLACEMENTS_URL = '/api/buildings/placements';
const ASSIGNMENTS_URL = '/api/buildings/assignments';

export class BackendBuildingSource implements BuildingSource {
  constructor(
    private readonly http: HttpClient,
    private readonly destroyRef: DestroyRef,
  ) {}

  loadBuildings(): Promise<BuildingSpec[]> {
    return new Promise<BuildingSpec[]>((resolve, reject) => {
      this.http
        .get<BuildingSpec[]>(BUILDINGS_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (buildings) => resolve(buildings),
          error: (err) => reject(err),
          complete: () => reject(new Error('buildings request disposed before it answered')),
        });
    });
  }

  loadPlacements(): Promise<BuildingPlacement[]> {
    return new Promise<BuildingPlacement[]>((resolve, reject) => {
      this.http
        .get<BuildingPlacement[]>(PLACEMENTS_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (placements) => resolve(placements),
          error: (err) => reject(err),
          complete: () => reject(new Error('placements request disposed before it answered')),
        });
    });
  }

  loadAssignments(): Promise<BuildingAssignments> {
    return new Promise<BuildingAssignments>((resolve, reject) => {
      this.http
        .get<BuildingAssignments>(ASSIGNMENTS_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (assignments) => resolve(assignments),
          error: (err) => reject(err),
          complete: () => reject(new Error('assignments request disposed before it answered')),
        });
    });
  }
}
