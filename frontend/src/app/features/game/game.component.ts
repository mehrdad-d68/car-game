import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import { InputService } from '../../core/services/input.service';
import { BackendCarSource } from './adapters/backend-car-source';
import { BackendPropSource } from './adapters/backend-prop-source';
import { BackendTrackSource } from './adapters/backend-track-source';
import { KeyboardInput } from './adapters/keyboard-input';
import { CarSelectComponent } from './car-select/car-select.component';
import { Engine } from './engine';
import { CarSpec } from './engine/sim/car-spec';
import {
  StreetOption,
  StreetSearchComponent,
} from './street-search/street-search.component';
import { LoadMapComponent } from './load-map/load-map.component';
import { OSMMapData } from './engine/sim/osm-types';
import { createTrack } from './engine/sim/track';

@Component({
  selector: 'app-game',
  imports: [StreetSearchComponent, CarSelectComponent, LoadMapComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  private readonly container =
    viewChild.required<ElementRef<HTMLDivElement>>('gameContainer');
  private readonly streetSearch = viewChild.required(StreetSearchComponent);
  private readonly carSelect = viewChild.required(CarSelectComponent);
  private readonly keys = inject(InputService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private engine?: Engine;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    this.engine = await Engine.create(
      this.container().nativeElement,
      new KeyboardInput(this.keys),
      new BackendTrackSource(this.http, this.destroyRef),
      new BackendCarSource(this.http, this.destroyRef),
      new BackendPropSource(this.http, this.destroyRef),
    );
    if (this.destroyed) {
      this.engine.dispose();
      return;
    }
    this.streetSearch().setTrack(this.engine.track);
    this.carSelect().setCars(this.engine.cars, this.engine.activeCar);
    this.engine.start();
  }

  onStreetSelected(street: StreetOption | null): void {
    if (!street) return;
    this.engine?.teleportTo(street.x, street.z, street.heading);
  }

  onCarSelected(spec: CarSpec): void {
    void this.engine?.setCar(spec);
  }

  onMapValidated(map: OSMMapData): void {
    if (!this.engine) return;
    const track = createTrack(map);
    void this.engine.setTrack(track);
    this.streetSearch().setTrack(track);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.engine?.dispose();
  }
}
