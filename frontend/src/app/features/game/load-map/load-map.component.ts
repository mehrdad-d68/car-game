import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from 'primeng/button';
import { OSMMapData } from '../engine/sim/osm-types';

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
}

const MAP_URL = '/api/map';

export async function parseMapJson(raw: string): Promise<OSMMapData> {
  return JSON.parse(raw) as OSMMapData;
}

@Component({
  selector: 'app-load-map',
  imports: [Button],
  templateUrl: './load-map.component.html',
  styleUrl: './load-map.component.css',
})
export class LoadMapComponent {
  readonly mapValidated = output<OSMMapData>();

  readonly errors = signal<string[] | null>(null);
  readonly busy = signal(false);

  private readonly fileInput =
    viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  onPick(): void {
    this.fileInput().nativeElement.click();
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void this.load(file);
  }

  private async load(file: File): Promise<void> {
    let map: OSMMapData;
    try {
      map = await parseMapJson(await file.text());
    } catch {
      this.errors.set(['The selected file is not valid JSON.']);
      return;
    }

    this.busy.set(true);
    this.errors.set(null);
    this.http
      .post<MapValidationResult>(MAP_URL, map)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          if (result.valid) {
            this.mapValidated.emit(map);
          } else {
            this.errors.set(result.errors);
          }
        },
        error: () => {
          this.busy.set(false);
          this.errors.set(['Could not reach the validation service.']);
        },
      });
  }
}