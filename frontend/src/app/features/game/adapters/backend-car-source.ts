import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { CarSource } from '../engine/ports';
import { CarSpec } from '../engine/sim/car-spec';
import { withModelApiUrl } from './api-url';

const CARS_URL = `${environment.apiUrl}/api/cars`;

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
          next: (cars) => resolve(cars.map((car) => withModelApiUrl(car))),
          error: (err) => reject(err),
        });
    });
  }
}
