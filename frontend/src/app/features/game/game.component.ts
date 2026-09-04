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
import { KeyboardInput } from './adapters/keyboard-input';
import { MapTrackSource } from './adapters/map-track-source';
import { Engine } from './engine';
import {
  StreetOption,
  StreetSearchComponent,
} from './street-search/street-search.component';

@Component({
  selector: 'app-game',
  imports: [StreetSearchComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  private readonly container =
    viewChild.required<ElementRef<HTMLDivElement>>('gameContainer');
  private readonly streetSearch = viewChild.required(StreetSearchComponent);
  private readonly keys = inject(InputService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private engine?: Engine;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    this.engine = await Engine.create(
      this.container().nativeElement,
      new KeyboardInput(this.keys),
      new MapTrackSource(this.http, this.destroyRef),
    );
    if (this.destroyed) {
      this.engine.dispose();
      return;
    }
    this.streetSearch().setTrack(this.engine.track);
    this.engine.start();
  }

  onStreetSelected(street: StreetOption | null): void {
    if (!street) return;
    this.engine?.teleportTo(street.x, street.z, street.heading);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.engine?.dispose();
  }
}
