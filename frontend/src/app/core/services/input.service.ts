import { Injectable, OnDestroy } from '@angular/core';

const SWALLOWED_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

@Injectable({ providedIn: 'root' })
export class InputService implements OnDestroy {
  private readonly codes = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    this.codes.add(event.code);
    if (SWALLOWED_CODES.has(event.code)) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.codes.delete(event.code);
  };

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.codes.has(code));
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.codes.clear();
  }
}
