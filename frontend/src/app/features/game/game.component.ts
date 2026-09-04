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

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  private readonly container =
    viewChild.required<ElementRef<HTMLDivElement>>('gameContainer');
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
    this.engine.start();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.engine?.dispose();
  }
}
