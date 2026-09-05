import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CarSource } from '../engine/ports';
import { CarSpec } from '../engine/sim/car-spec';

const CARS_URL = '/api/cars';

export class BackendCarSource implements CarSource {
  constructor(
    private readonly http: HttpClient,
    private readonly destroyRef: DestroyRef,
  ) {}

  loadCars(): Promise<CarSpec[]> {
    return new Promise<CarSpec[]>((resolve, reject) => {
      this.http
        .get<CarSpec[]>(CARS_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (cars) => resolve(cars),
          error: (err) => reject(err),
        });
    });
  }
}
