import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { CarSpec } from '../engine/sim/car-spec';

@Component({
  selector: 'app-car-select',
  imports: [Select, FormsModule],
  templateUrl: './car-select.component.html',
  styleUrl: './car-select.component.css',
})
export class CarSelectComponent {
  readonly carSelected = output<CarSpec>();

  readonly cars = signal<CarSpec[]>([]);
  readonly selected = signal<CarSpec | null>(null);

  setCars(cars: CarSpec[], active?: CarSpec): void {
    this.cars.set(cars);
    if (active) {
      this.selected.set(active);
    }
  }

  onSelect(car: CarSpec | null): void {
    if (!car) return;
    this.carSelected.emit(car);
    requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }
}