import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { PropSource } from '../engine/ports';
import { PropSpec } from '../engine/sim/prop-spec';
import { withModelApiUrl } from './api-url';

const PROPS_URL = `${environment.apiUrl}/api/props`;

export class BackendPropSource implements PropSource {
  constructor(
    private readonly http: HttpClient,
    private readonly destroyRef: DestroyRef,
  ) {}

  loadProps(): Promise<PropSpec[]> {
    return new Promise<PropSpec[]>((resolve, reject) => {
      this.http
        .get<PropSpec[]>(PROPS_URL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (props) => resolve(props.map((prop) => withModelApiUrl(prop))),
          error: (err) => reject(err),
        });
    });
  }
}