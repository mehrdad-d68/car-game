import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { Engine } from '../engine';
import { makeGeoProjector } from '../engine/sim/geo';

export interface InspectPin {
  n: number;
  text: string;
}

export const MAX_PINS = 9;

function withinBounds(
  x: number,
  z: number,
  bounds: Pick<{ minX: number; minZ: number; maxX: number; maxZ: number }, 'minX' | 'minZ' | 'maxX' | 'maxZ'>,
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function parseGoTo(
  text: string,
  center: { lat: number; lng: number },
  bounds?: { minX: number; minZ: number; maxX: number; maxZ: number },
): { x: number; z: number } | null {
  const parts = text
    .trim()
    .split(/[\s,;]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const asWorld = { x: a, z: b };
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return asWorld;
  const project = makeGeoProjector(center);
  const asLatLng = project(a, b);
  if (bounds) {
    if (withinBounds(asWorld.x, asWorld.z, bounds)) return asWorld;
    if (withinBounds(asLatLng.x, asLatLng.z, bounds)) return asLatLng;
  }
  return asWorld;
}

@Component({
  selector: 'app-debug-inspector',
  imports: [FormsModule],
  templateUrl: './debug-inspector.component.html',
  styleUrl: './debug-inspector.component.css',
})
export class DebugInspectorComponent implements OnInit {
  readonly enabled = !environment.production;
  active = signal(false);
  pins = signal<InspectPin[]>([]);
  goToText = '';
  goToError = signal(false);

  private engine?: Engine;
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    window.addEventListener('keydown', this.onWindowKey);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('keydown', this.onWindowKey),
    );
  }

  attach(engine: Engine): void {
    this.engine = engine;
  }

  private readonly onWindowKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Backquote') return;
    if (this.isWidgetTarget(event.target)) return;
    event.preventDefault();
    this.toggle();
  };

  private isWidgetTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
  }

  toggle(): void {
    if (!this.enabled || !this.engine) return;
    const next = !this.active();
    this.engine.setInspectMode(next);
    if (!next) this.pins.set([]);
    this.active.set(next);
  }

  onContainerClick(event: MouseEvent): void {
    if (!this.active() || !this.engine) return;
    if (this.engine.pinCount >= MAX_PINS) return;
    const result = this.engine.inspectAt(event.clientX, event.clientY);
    if (!result) return;
    const n = this.engine.pinCount;
    const text = this.engine.reportText(n);
    if (text === null) return;
    this.pins.update((current) =>
      current.some((pin) => pin.n === n) ? current : [...current, { n, text }],
    );
  }

  copyPins(pins: InspectPin[]): void {
    const text = pins.map((pin) => pin.text).join('\n\n');
    if (text) void navigator.clipboard?.writeText(text);
  }

  goPin(pin: InspectPin): void {
    if (!this.engine) return;
    const pos = this.engine.pinPosition(pin.n);
    this.engine.goTo(pos.x, pos.z);
    this.goToText = '';
    this.pins.set([]);
  }

  onGoToSubmit(): void {
    if (!this.engine) return;
    const pos = parseGoTo(
      this.goToText,
      this.engine.track.meta.center,
      this.engine.track.bounds,
    );
    if (!pos) {
      this.goToError.set(true);
      setTimeout(() => this.goToError.set(false), 1500);
      return;
    }
    this.engine.goTo(pos.x, pos.z);
    this.goToText = '';
    this.pins.set([]);
  }
}