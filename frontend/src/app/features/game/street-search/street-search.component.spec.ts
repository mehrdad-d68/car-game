import { TestBed } from '@angular/core/testing';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { buildStreetOptions, streetTeleport, StreetOption, StreetSearchComponent } from './street-search.component';
import { createTrack } from '../engine/sim/track';
import { OSMMapData } from '../engine/sim/osm-types';

function isAt(option: StreetOption, x: number, z: number): boolean {
  return option.x === x && option.z === z;
}

describe('streetTeleport', () => {
  it('picks a true endpoint across multiple segments', () => {
    const result = streetTeleport({
      name: 'Teststraße',
      segments: [
        [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
        [{ x: 20, z: 0 }, { x: 40, z: 0 }],
      ],
    });

    expect(result.label).toBe('Teststraße');
    expect(isAt(result, 0, 0) || isAt(result, 40, 0)).toBe(true);
    expect(Math.abs(result.heading)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('uses the first point as teleport origin at one end', () => {
    const result = streetTeleport({
      name: 'Nordgasse',
      segments: [[{ x: 5, z: 5 }, { x: 5, z: 50 }]],
    });

    expect(isAt(result, 5, 5) || isAt(result, 5, 50)).toBe(true);
  });

  it('falls back to zero heading when the street has no length', () => {
    const result = streetTeleport({
      name: 'Punktplatz',
      segments: [[{ x: 3, z: 3 }, { x: 3, z: 3 }]],
    });

    expect(result.x).toBe(3);
    expect(result.z).toBe(3);
    expect(result.heading).toBe(0);
  });

  it('uses the local road direction at the start, not the start-to-end chord', () => {
    const result = streetTeleport({
      name: 'Kurvengasse',
      segments: [[{ x: 0, z: 100 }, { x: 30, z: 60 }, { x: 0, z: 0 }]],
    });

    const expected = Math.atan2(-(30 - 0), -(60 - 100));
    expect(result.x).toBe(0);
    expect(result.z).toBe(100);
    expect(result.heading).toBeCloseTo(expected, 5);
    expect(result.heading).not.toBeCloseTo(0, 5);
  });

  it('returns the origin when every segment is empty', () => {
    const result = streetTeleport({ name: 'Leer', segments: [] });
    expect(result).toEqual({ label: 'Leer', x: 0, z: 0, heading: 0 });
  });
});

describe('buildStreetOptions', () => {
  function data(): OSMMapData {
    return {
      meta: {
        source: 'openstreetmap',
        generatedAt: '2026-01-01T00:00:00Z',
        place: 'test',
        center: { lat: 0, lng: 0 },
        bbox: { south: 0, west: 0, north: 1, east: 1 },
        totalRoads: 4,
      },
      roads: [
        {
          id: 1,
          type: 'residential',
          name: 'Zedgasse',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
          ],
        },
        {
          id: 2,
          type: 'residential',
          name: ' Alphaweg ',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: 50 },
            { x: 0, z: 60 },
          ],
        },
        {
          id: 3,
          type: 'service',
          name: 'Zedgasse',
          lanes: 2,
          width: 8,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 10, z: 0 },
            { x: 40, z: 0 },
          ],
        },
        {
          id: 4,
          type: 'service',
          name: 'Stub',
          lanes: 1,
          width: 4,
          oneway: 0,
          access: 'private',
          points: [{ x: 5, z: 5 }],
        },
      ],
    };
  }

  it('populates sorted, trimmed, name-grouped streets', () => {
    const options = buildStreetOptions(createTrack(data()));

    const labels = options.map((o) => o.label);
    expect(labels).toEqual([' Alphaweg '.trim(), 'Zedgasse']);
    expect(labels.length).toBe(2);
  });

  it('groups split ways and teleports to an extreme endpoint', () => {
    const options = buildStreetOptions(createTrack(data()));

    const zed = options.find((o) => o.label === 'Zedgasse')!;
    expect(isAt(zed, 0, 0) || isAt(zed, 40, 0)).toBe(true);
  });

  it('excludes unnamed roads', () => {
    const d = data();
    d.roads.push({
      id: 5,
      type: 'service',
      name: '',
      lanes: 1,
      width: 6,
      oneway: 0,
      access: 'private',
      points: [
        { x: 100, z: 0 },
        { x: 110, z: 0 },
      ],
    });
    const options = buildStreetOptions(createTrack(d));
    expect(options.every((o) => o.label.length > 0)).toBe(true);
  });
});

describe('StreetSearchComponent button actions', () => {
  const option: StreetOption = { label: 'Zedgasse', x: 0, z: 0, heading: 0 };

  let injector: EnvironmentInjector;

  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
    injector = TestBed.inject(EnvironmentInjector);
  });

  it('jump click emits jump and stops the row selection', () => {
    const comp = runInInjectionContext(injector, () => new StreetSearchComponent());
    const jumps: StreetOption[] = [];
    comp.jump.subscribe((s: StreetOption) => jumps.push(s));

    const event = new Event('click');
    const stop = vi.spyOn(event, 'stopPropagation');
    comp.onJumpClick(option, event);

    expect(jumps).toEqual([option]);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('navigate click emits navigate and stops the row selection', () => {
    const comp = runInInjectionContext(injector, () => new StreetSearchComponent());
    const navs: StreetOption[] = [];
    comp.navigate.subscribe((s: StreetOption) => navs.push(s));

    const event = new Event('click');
    const stop = vi.spyOn(event, 'stopPropagation');
    comp.onNavigateClick(option, event);

    expect(navs).toEqual([option]);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});