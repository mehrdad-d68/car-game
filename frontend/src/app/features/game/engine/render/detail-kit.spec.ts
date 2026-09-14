import { createBuildings, FLOOR_HEIGHT } from '../sim/buildings';
import {
  DOOR_CLEAR,
  DOOR_HEIGHT,
  PART_KINDS,
  planParts,
  WINDOW_HEIGHT,
  WINDOW_INSET,
} from './detail-kit';

function make(type: string, size: number, levels: number | null, id = 1) {
  return createBuildings([
    {
      id,
      type,
      name: '',
      levels: levels ?? undefined,
      points: [
        { x: 0, z: 0 },
        { x: size, z: 0 },
        { x: size, z: size },
        { x: 0, z: size },
        { x: 0, z: 0 },
      ],
    },
  ])[0];
}

function onEdge(part: { x: number; z: number; yaw: number }, yaw: number): number {
  return part.x * Math.sin(yaw) + part.z * Math.cos(yaw);
}

describe('planParts', () => {
  it('gives houses a sloped roof and no parapet', () => {
    const kinds = planParts(make('house', 10, 2)).map((p) => p.kind);
    expect(kinds).toContain('gableRoof');
    expect(kinds).not.toContain('parapet');
  });

  it('gives apartments a parapet and rooftop clutter', () => {
    const kinds = planParts(make('apartments', 30, 6)).map((p) => p.kind);
    expect(kinds).toContain('parapet');
    expect(kinds.some((k) => k === 'tank' || k === 'aerial' || k === 'acBox')).toBe(true);
  });

  it('gives shops an awning and a sign near the ground floor', () => {
    const parts = planParts(make('retail', 12, 2));
    const awning = parts.find((p) => p.kind === 'awning');
    expect(awning).toBeDefined();
    expect(awning!.y).toBeLessThan(4);
    expect(parts.map((p) => p.kind)).toContain('sign');
  });

  it('gives works a sawtooth roof and huts only a flat roof and a door', () => {
    expect(planParts(make('industrial', 40, 1)).map((p) => p.kind)).toContain('sawtooth');
    expect(planParts(make('shed', 6, 1)).map((p) => p.kind)).toEqual(['flatRoof', 'door']);
  });

  it('is stable for one building and differs between buildings', () => {
    const a = planParts(make('apartments', 30, 6, 111));
    expect(planParts(make('apartments', 30, 6, 111))).toEqual(a);
    expect(JSON.stringify(planParts(make('apartments', 30, 6, 222)))).not.toEqual(JSON.stringify(a));
  });

  it('keeps every part above the ground and within the footprint', () => {
    for (const type of ['house', 'apartments', 'retail', 'industrial', 'shed']) {
      for (const part of planParts(make(type, 20, 3))) {
        expect(PART_KINDS).toContain(part.kind);
        expect(part.y).toBeGreaterThan(0);
        expect(part.x).toBeGreaterThanOrEqual(-1);
        expect(part.x).toBeLessThanOrEqual(21);
        expect(part.z).toBeGreaterThanOrEqual(-1);
        expect(part.z).toBeLessThanOrEqual(21);
      }
    }
  });
});

describe('roof parts follow the real outline', () => {
  const ROOF_BOXES = ['gableRoof', 'flatRoof', 'sawtooth', 'parapet'];

  function shape(type: string, points: { x: number; z: number }[], levels = 2, id = 3) {
    return createBuildings([{ id, type, name: '', levels, points: [...points, points[0]] }])[0];
  }

  function rect(w: number, d: number, angle = 0) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: d },
      { x: 0, z: d },
    ].map((p) => ({ x: 100 + p.x * c - p.z * s, z: 50 + p.x * s + p.z * c }));
  }

  function inside(x: number, z: number, ring: { x: number; z: number }[]): boolean {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  }

  function corners(p: { x: number; z: number; yaw: number; sx: number; sz: number }) {
    // three.js Y rotation: local X -> (cos, -sin), local Z -> (sin, cos); shrink 1% to stay off the boundary
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const hx = (p.sx / 2) * 0.99;
    const hz = (p.sz / 2) * 0.99;
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([i, k]) => ({ x: p.x + i * hx * c + k * hz * s, z: p.z - i * hx * s + k * hz * c }));
  }

  function expectRoofInside(building: ReturnType<typeof shape>) {
    for (const part of planParts(building).filter((p) => ROOF_BOXES.includes(p.kind))) {
      for (const corner of corners(part)) {
        expect(
          inside(corner.x, corner.z, building.points),
          `${building.style} ${part.kind} corner ${corner.x.toFixed(2)},${corner.z.toFixed(2)}`,
        ).toBe(true);
      }
    }
  }

  it('keeps the roof of a building longer north-south than east-west on the building', () => {
    for (const type of ['house', 'retail', 'industrial', 'shed', 'apartments']) {
      const building = shape(type, rect(10, 60));
      expect(planParts(building).some((p) => ROOF_BOXES.includes(p.kind))).toBe(true);
      expectRoofInside(building);
    }
  });

  it('turns the roof with a diagonal building instead of covering its bounding box', () => {
    for (const type of ['house', 'retail', 'industrial', 'shed', 'apartments']) {
      const building = shape(type, rect(12, 40, Math.PI / 5));
      expect(planParts(building).some((p) => ROOF_BOXES.includes(p.kind))).toBe(true);
      expectRoofInside(building);
    }
  });

  it('puts no roof box over the empty corner of an L-shaped building', () => {
    const l = [
      { x: 0, z: 0 },
      { x: 30, z: 0 },
      { x: 30, z: 10 },
      { x: 10, z: 10 },
      { x: 10, z: 30 },
      { x: 0, z: 30 },
    ];
    for (const type of ['house', 'retail', 'industrial', 'shed', 'apartments']) {
      expectRoofInside(shape(type, l));
    }
  });

  it('keeps chimneys and rooftop clutter on the roof of odd shapes', () => {
    const l = [
      { x: 0, z: 0 },
      { x: 30, z: 0 },
      { x: 30, z: 10 },
      { x: 10, z: 10 },
      { x: 10, z: 30 },
      { x: 0, z: 30 },
    ];
    for (let id = 1; id <= 40; id++) {
      for (const building of [shape('apartments', l, 6, id), shape('house', rect(8, 30, 0.7), 2, id)]) {
        for (const part of planParts(building)) {
          if (['chimney', 'tank', 'aerial', 'acBox'].includes(part.kind)) {
            expect(inside(part.x, part.z, building.points)).toBe(true);
          }
        }
      }
    }
  });
});

describe('windows and doors', () => {
  it('gives every building exactly one door on the longest wall', () => {
    for (const type of ['house', 'apartments', 'retail', 'industrial', 'shed']) {
      const doors = planParts(make(type, 12, 2, 5)).filter((p) => p.kind === 'door');
      expect(doors).toHaveLength(1);
    }
  });

  it('stands the door on the ground at the middle of the wall it belongs to', () => {
    const door = planParts(make('house', 12, 2, 7)).find((p) => p.kind === 'door')!;
    expect(door.y).toBeCloseTo(DOOR_HEIGHT / 2, 6);
    expect(door.sy).toBeCloseTo(DOOR_HEIGHT, 6);
    expect(onEdge(door, door.yaw)).toBeCloseTo(6, 5);
  });

  it('fills every storey with evenly spaced windows, clear of the door', () => {
    const parts = planParts(make('house', 20, 2, 9));
    const windows = parts.filter((p) => p.kind === 'window');
    expect(windows).toHaveLength(46);
    const door = parts.find((p) => p.kind === 'door')!;
    for (const window of windows) {
      if (Math.abs(window.yaw - door.yaw) < 1e-6) {
        expect(Math.abs(onEdge(window, door.yaw) - onEdge(door, door.yaw))).toBeGreaterThanOrEqual(
          door.sz / 2 + DOOR_CLEAR - WINDOW_INSET,
        );
      }
    }
  });

  it('keeps one window row per floor, all below the roof', () => {
    const parts = planParts(make('house', 20, 3, 11));
    const windows = parts.filter((p) => p.kind === 'window');
    expect(windows).toHaveLength(69);
    for (const window of windows) {
      expect(window.y + WINDOW_HEIGHT / 2).toBeLessThan(3 * FLOOR_HEIGHT);
      expect(window.sy).toBeCloseTo(WINDOW_HEIGHT, 6);
    }
  });

  it('draws no windows on a hut and a wider door on huts and works', () => {
    const hut = planParts(make('shed', 6, 1, 13));
    expect(hut.filter((p) => p.kind === 'window')).toHaveLength(0);
    expect(hut.find((p) => p.kind === 'door')!.sz).toBeCloseTo(2.4, 6);
    const works = planParts(make('industrial', 40, 1, 17));
    expect(works.find((p) => p.kind === 'door')!.sz).toBeCloseTo(2.4, 6);
  });

  it('leaves the shop ground floor as a storefront', () => {
    const windows = planParts(make('retail', 12, 2, 19)).filter((p) => p.kind === 'window');
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.y > FLOOR_HEIGHT)).toBe(true);
  });
});