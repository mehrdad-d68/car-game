import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';
import { InputService } from '../../core/services/input.service';
import { BackendCarSource } from './adapters/backend-car-source';
import { BackendBuildingSource } from './adapters/backend-building-source';
import { BackendPropSource } from './adapters/backend-prop-source';
import { BackendTrackSource } from './adapters/backend-track-source';
import { KeyboardInput } from './adapters/keyboard-input';
import { CarSelectComponent } from './car-select/car-select.component';
import { DebugInspectorComponent } from './debug-inspector/debug-inspector.component';
import { Engine, NavigationState, StepManeuver } from './engine';
import { CarSpec } from './engine/sim/car-spec';
import {
  StreetOption,
  StreetSearchComponent,
} from './street-search/street-search.component';

@Component({
  selector: 'app-game',
  imports: [StreetSearchComponent, CarSelectComponent, DebugInspectorComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  readonly isProduction = environment.production;

  private readonly container =
    viewChild.required<ElementRef<HTMLDivElement>>('gameContainer');
  private readonly streetSearch = viewChild.required(StreetSearchComponent);
  private readonly carSelect = viewChild.required(CarSelectComponent);
  private readonly debugInspector =
    viewChild(DebugInspectorComponent);
  private readonly keys = inject(InputService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  navigationState = signal<NavigationState | null>(null);
  noRoute = signal(false);

  private engine?: Engine;
  private destroyed = false;
  private stopNavigationUpdates?: () => void;

  async ngAfterViewInit(): Promise<void> {
    this.engine = await Engine.create(
      this.container().nativeElement,
      new KeyboardInput(this.keys),
      new BackendTrackSource(this.http, this.destroyRef),
      new BackendCarSource(this.http, this.destroyRef),
      new BackendPropSource(this.http, this.destroyRef),
      new BackendBuildingSource(this.http, this.destroyRef),
    );
    if (this.destroyed) {
      this.engine.dispose();
      return;
    }
    this.streetSearch().setTrack(this.engine.track);
    this.carSelect().setCars(this.engine.cars, this.engine.activeCar);
    this.debugInspector()?.attach(this.engine);
    this.stopNavigationUpdates = this.engine.onNavigation((state) =>
      this.navigationState.set(state),
    );
    this.engine.start();
  }

  onStreetSelected(street: StreetOption | null): void {
    if (!street) return;
    this.engine?.teleportTo(street.x, street.z, street.heading);
  }

  onJump(street: StreetOption): void {
    this.engine?.teleportTo(street.x, street.z, street.heading);
  }

  onNavigate(street: StreetOption): void {
    const result = this.engine?.navigateTo(street.label);
    if (result === 'no-route') {
      this.noRoute.set(true);
      setTimeout(() => this.noRoute.set(false), 2000);
    }
  }

  onCarSelected(spec: CarSpec): void {
    void this.engine?.setCar(spec);
  }

  cancelNavigation(): void {
    this.engine?.clearRoute();
    this.navigationState.set(null);
  }

  formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  maneuverIcon(maneuver: StepManeuver | undefined): string {
    switch (maneuver) {
      case 'left':
        return '↰';
      case 'right':
        return '↱';
      case 'uturn':
        return '⤺';
      case 'arrive':
        return '⚑';
      default:
        return '↑';
    }
  }

  maneuverWord(maneuver: StepManeuver): string {
    switch (maneuver) {
      case 'left':
        return 'Left';
      case 'right':
        return 'Right';
      case 'uturn':
        return 'U-turn';
      case 'arrive':
        return 'Arrive';
      default:
        return '';
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopNavigationUpdates?.();
    this.engine?.dispose();
  }
}
