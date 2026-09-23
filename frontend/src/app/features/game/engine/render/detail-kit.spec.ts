import { createBuildings, FLOOR_HEIGHT } from '../sim/buildings';
import { PART_KINDS, planParts } from './detail-kit';

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

function toSet(kinds: string[]): Set<string> {
  return new Set(kinds);
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

  it('gives works a sawtooth roof and huts only a flat roof', () => {
    expect(planParts(make('industrial', 40, 1)).map((p) => p.kind)).toContain('sawtooth');
    expect(planParts(make('shed', 6, 1)).map((p) => p.kind)).toEqual(['flatRoof']);
  });

  it('is stable for one building and differs between buildings', () => {
    const a = planParts(make('apartments', 30, 6, 111));
    expect(planParts(make('apartments', 30, 6, 111))).toEqual(a);
    expect(JSON.stringify(planParts(make('apartments', 30, 6, 222)))).not.toEqual(JSON.stringify(a));
  });

  it('keeps every part above the ground and near the footprint', () => {
    for (const type of ['house', 'apartments', 'retail', 'industrial', 'shed']) {
      for (const part of planParts(make(type, 20, 3))) {
        expect(PART_KINDS).toContain(part.kind);
        expect(part.y).toBeGreaterThan(0);
        expect(part.x).toBeGreaterThanOrEqual(-1.5);
        expect(part.x).toBeLessThanOrEqual(21);
        expect(part.z).toBeGreaterThanOrEqual(-1.5);
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

describe('part kinds', () => {
  it('no longer plans windows or doors as boxes', () => {
    expect(PART_KINDS).not.toContain('window');
    expect(PART_KINDS).not.toContain('door');
    for (const type of ['house', 'apartments', 'retail', 'industrial', 'shed']) {
      const parts = planParts(make(type, 20, 3, 4));
      expect(parts.some((p) => String(p.kind) === 'window' || String(p.kind) === 'door')).toBe(false);
    }
  });
});

describe('balconies', () => {
  it('gives houses and apartments balconies on the longest wall', () => {
    for (const type of ['house', 'apartments']) {
      const parts = planParts(make(type, 30, 6, 21)).filter((p) => p.kind === 'balcony');
      expect(parts.length).toBeGreaterThanOrEqual(1);
      expect(parts.length).toBeLessThanOrEqual(3);
      for (const balcony of parts) {
        expect(balcony.sy).toBeCloseTo(0.14, 6);
        expect(balcony.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT + 0.15);
      }
    }
  });

  it('keeps balconies on the street face and above the plinth', () => {
    const parts = planParts(make('house', 30, 4, 23));
    const balconies = parts.filter((p) => p.kind === 'balcony');
    for (const balcony of balconies) {
      expect(balcony.y).toBeGreaterThan(FLOOR_HEIGHT);
      const along = onEdge(balcony, balcony.yaw);
      expect(Math.abs(along)).toBeLessThan(28.9);
      expect(Math.abs(along)).toBeGreaterThan(1);
    }
  });

  it('sits the slab against the wall instead of floating outside it', () => {
    const building = make('apartments', 20, 3);
    const balconies = planParts(building).filter((p) => p.kind === 'balcony');
    expect(balconies.length).toBeGreaterThanOrEqual(1);
    const a = building.points[0];
    const b = building.points[1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    for (const balcony of balconies) {
      const offset = (balcony.x - a.x) * uz - (balcony.z - a.z) * ux;
      expect(offset - balcony.sx / 2).toBeLessThan(0.01);
      expect(offset + balcony.sx / 2).toBeGreaterThan(0.9);
    }
  });

  it('guards each balcony on the front and sides and gives it an access door', () => {
    const building = make('apartments', 20, 3);
    const parts = planParts(building);
    const balconies = parts.filter((p) => p.kind === 'balcony');
    expect(balconies.length).toBeGreaterThanOrEqual(1);
    const guards = parts.filter((p) => p.kind === 'balustrade');
    const doors = parts.filter((p) => p.kind === 'balconyDoor');
    expect(guards.length).toBeGreaterThanOrEqual(balconies.length * 3);
    expect(doors.length).toBe(balconies.length);
    for (let i = 0; i < balconies.length; i++) {
      expect(guards[i * 3].yaw).toBe(balconies[i].yaw);
      expect(onEdge(doors[i], doors[i].yaw)).toBeCloseTo(onEdge(balconies[i], balconies[i].yaw), 6);
      expect(doors[i].y).toBeGreaterThan(0);
    }
  });

  it('gives shops, works and huts no balconies or dormers', () => {
    for (const type of ['retail', 'industrial', 'shed']) {
      const kinds = toSet(planParts(make(type, 30, 3, 25)).map((p) => p.kind));
      expect(kinds.has('balcony')).toBe(false);
      expect(kinds.has('dormer')).toBe(false);
    }
  });

  it('keeps balconies out of a taller building that covers the street side', () => {
    const house = make('house', 30, 4, 41);
    expect(planParts(house).filter((p) => p.kind === 'balcony').length).toBeGreaterThan(0);

    const tower = createBuildings([
      {
        id: 42,
        type: 'apartments',
        name: '',
        levels: 8,
        points: [
          { x: 0, z: -10 },
          { x: 30, z: -10 },
          { x: 30, z: 2 },
          { x: 0, z: 2 },
          { x: 0, z: -10 },
        ],
      },
    ])[0];
    const kinds = planParts(house, [tower]).map((p) => p.kind);
    expect(kinds.filter((k) => k === 'balcony')).toHaveLength(0);
  });

  it('still places balconies when the neighbour is lower than the slab', () => {
    const house = make('house', 30, 4, 43);
    const low = createBuildings([
      {
        id: 44,
        type: 'garage',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: -10 },
          { x: 30, z: -10 },
          { x: 30, z: 2 },
          { x: 0, z: 2 },
          { x: 0, z: -10 },
        ],
      },
    ])[0];
    const kinds = planParts(house, [low]).map((p) => p.kind);
    expect(kinds.filter((k) => k === 'balcony').length).toBeGreaterThan(0);
  });
});

describe('dormers', () => {
  it('sits 1-2 dormers on the roof slope of a house with a gable roof', () => {
    const parts = planParts(make('house', 30, 2, 27));
    const kinds = parts.map((p) => p.kind);
    expect(kinds).toContain('gableRoof');
    const roof = parts.find((p) => p.kind === 'gableRoof')!;
    const dormers = parts.filter((p) => p.kind === 'dormer');
    expect(dormers.length).toBeGreaterThanOrEqual(1);
    expect(dormers.length).toBeLessThanOrEqual(2);
    for (const dormer of dormers) {
      expect(dormer.y).toBeGreaterThan(roof.y + roof.sy / 2);
      const distToRidge =
        Math.abs(
          (dormer.x - roof.x) * Math.cos(roof.yaw) -
            (dormer.z - roof.z) * Math.sin(roof.yaw),
        );
      expect(distToRidge).toBeGreaterThan(0.5);
    }
  });

  it('places no dormer on a house without a gable roof', () => {
    const shed = planParts(make('shed', 6, 1, 29));
    expect(shed.filter((p) => p.kind === 'dormer')).toHaveLength(0);
  });
});