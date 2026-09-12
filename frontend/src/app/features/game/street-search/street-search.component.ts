import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { TrackData } from '../engine/sim/track';
import { Vec2 } from '../engine/sim/types';

export type StreetCandidate = {
  name: string;
  segments: Vec2[][];
};

export interface StreetOption {
  label: string;
  x: number;
  z: number;
  heading: number;
}

type EndRef = {
  point: Vec2;
  seg: Vec2[];
  isFirst: boolean;
};

export function buildStreetOptions(track: TrackData): StreetOption[] {
  const byName = new Map<string, Vec2[][]>();

  for (const road of track.roads) {
    const name = road.name?.trim();
    if (!name || road.points.length < 2) continue;

    let segments = byName.get(name);
    if (!segments) {
      segments = [];
      byName.set(name, segments);
    }
    segments.push(road.points);
  }

  const candidates: StreetCandidate[] = [];
  for (const [name, segments] of byName) {
    candidates.push({ name, segments });
  }

  return candidates
    .map(streetTeleport)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function headingFromRef(ref: EndRef): number {
  const { seg, isFirst } = ref;
  const n = seg.length;
  if (n < 2) return 0;
  let dx: number;
  let dz: number;
  if (isFirst) {
    dx = seg[1].x - seg[0].x;
    dz = seg[1].z - seg[0].z;
  } else {
    dx = seg[n - 2].x - seg[n - 1].x;
    dz = seg[n - 2].z - seg[n - 1].z;
  }
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  return Math.atan2(-dx, -dz);
}

export function streetTeleport(candidate: StreetCandidate): StreetOption {
  const endRefs: EndRef[] = [];

  for (const seg of candidate.segments) {
    if (seg.length === 0) continue;
    endRefs.push({ point: seg[0], seg, isFirst: true });
    if (seg.length > 1) {
      endRefs.push({ point: seg[seg.length - 1], seg, isFirst: false });
    }
  }

  if (endRefs.length === 0) {
    return { label: candidate.name, x: 0, z: 0, heading: 0 };
  }

  let cx = 0;
  let cz = 0;
  for (const ref of endRefs) {
    cx += ref.point.x;
    cz += ref.point.z;
  }
  cx /= endRefs.length;
  cz /= endRefs.length;

  let start = endRefs[0];
  let maxDistSq = -1;
  for (const ref of endRefs) {
    const dx = ref.point.x - cx;
    const dz = ref.point.z - cz;
    const d = dx * dx + dz * dz;
    if (d > maxDistSq) {
      maxDistSq = d;
      start = ref;
    }
  }

  return {
    label: candidate.name,
    x: start.point.x,
    z: start.point.z,
    heading: headingFromRef(start),
  };
}

@Component({
  selector: 'app-street-search',
  imports: [Select, FormsModule],
  templateUrl: './street-search.component.html',
  styleUrl: './street-search.component.css',
})
export class StreetSearchComponent {
  readonly streetSelected = output<StreetOption>();

  readonly streets = signal<StreetOption[]>([]);
  readonly selected = signal<StreetOption | null>(null);

  setTrack(track: TrackData): void {
    this.streets.set(buildStreetOptions(track));
  }

  onSelect(street: StreetOption | null): void {
    if (!street) return;
    this.streetSelected.emit(street);
    requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }
}
