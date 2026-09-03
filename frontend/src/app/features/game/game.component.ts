import { AfterViewInit, Component, ElementRef, OnDestroy, inject, viewChild } from '@angular/core';
import { InputService } from '../../core/services/input.service';
import { KeyboardInput } from './adapters/keyboard-input';
import { Engine } from './engine';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('gameContainer');
  private readonly keys = inject(InputService);

  private engine?: Engine;

  ngAfterViewInit(): void {
    this.engine = new Engine(this.container().nativeElement, new KeyboardInput(this.keys));
    this.engine.start();
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }
}
