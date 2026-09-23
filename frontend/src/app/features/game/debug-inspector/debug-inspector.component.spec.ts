import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Engine } from '../engine';
import { formatReport } from '../engine/sim/inspect';
import { InspectReport } from '../engine/sim/inspect';
import {
  DebugInspectorComponent,
  InspectPin,
  parseGoTo,
} from './debug-inspector.component';

const CENTER = { lat: 48.2, lng: 16.3 };
const SMALL_BOUNDS = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
const REAL_CENTER = { lat: 48.145, lng: 16.29 };
const REAL_BOUNDS = { minX: -3587, minZ: -2038, maxX: 3640, maxZ: 2350 };

describe('parseGoTo', () => {
  it('parses raw world coordinates', () => {
    expect(parseGoTo('1200 -50', CENTER, SMALL_BOUNDS)).toEqual({ x: 1200, z: -50 });
  });

  it('treats a point inside the map bounds as world coordinates', () => {
    expect(parseGoTo('5,7', CENTER, SMALL_BOUNDS)).toEqual({ x: 5, z: 7 });
  });

  it('interprets lat/lng pairs through the map centre', () => {
    const pos = parseGoTo('48.2,16.3', CENTER, SMALL_BOUNDS)!;
    expect(pos.x).toBeCloseTo(0, 5);
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it('treats a lat/lng pair inside the real map bounds as lat/lng, not metres', () => {
    const pos = parseGoTo('48.149095,16.300936', REAL_CENTER, REAL_BOUNDS)!;
    expect(pos.x).toBeCloseTo(812.3, 0);
    expect(pos.z).toBeCloseTo(-455.9, 0);
  });

  it('stays in world metres when a degree pair projects outside the map', () => {
    expect(parseGoTo('48,16', REAL_CENTER, REAL_BOUNDS)).toEqual({ x: 48, z: 16 });
  });

  it('accepts the report coordinate format with x= and z= prefixes', () => {
    expect(parseGoTo('x=812.3 z=-455.9', CENTER, SMALL_BOUNDS)).toEqual({
      x: 812.3,
      z: -455.9,
    });
  });

  it('round-trips the first line of a formatReport output', () => {
    const report: InspectReport = {
      x: 812.3,
      z: -455.9,
      lat: 48.149095,
      lng: 16.300936,
      road: null,
      node: null,
      building: null,
      nearby: [],
    };
    const firstLine = formatReport(2, report, {
      hit: null,
      car: null,
      route: null,
      map: null,
    }).split('\n')[0];
    const pos = parseGoTo(firstLine, REAL_CENTER, REAL_BOUNDS)!;
    expect(pos.x).toBeCloseTo(812.3, 1);
    expect(pos.z).toBeCloseTo(-455.9, 1);
  });

  it('rejects anything that is not two numbers', () => {
    expect(parseGoTo('', CENTER, SMALL_BOUNDS)).toBeNull();
    expect(parseGoTo('42', CENTER, SMALL_BOUNDS)).toBeNull();
    expect(parseGoTo('a b', CENTER, SMALL_BOUNDS)).toBeNull();
    expect(parseGoTo('1 2 3', CENTER, SMALL_BOUNDS)).toBeNull();
  });
});

describe('DebugInspectorComponent', () => {
  let injector: EnvironmentInjector;

  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
    injector = TestBed.inject(EnvironmentInjector);
  });

  function fakeEngine(): {
    engine: Engine;
    state: { inspectMode: boolean; pinCount: number };
  } {
    const state = { inspectMode: false, pinCount: 0 };
    const engine = {
      get inspectMode() {
        return state.inspectMode;
      },
      get pinCount() {
        return state.pinCount;
      },
      setInspectMode: (on: boolean) => {
        state.inspectMode = on;
      },
      inspectAt: () => null,
      reportText: () => 'report text',
      pinPosition: () => ({ x: 0, z: 0 }),
      goTo: () => undefined,
      track: { meta: { center: CENTER } },
      buildingDesigns: [],
      buildingDesign: () => null,
      workingOverride: () => undefined,
      setBuildingOverride: () => undefined,
      workingOverridesJson: () => '{}',
    } as unknown as Engine;
    return { engine, state };
  }

  function component(engine: Engine): DebugInspectorComponent {
    const c = runInInjectionContext(
      injector,
      () => new DebugInspectorComponent(),
    );
    c.attach(engine);
    return c;
  }

  it('toggles the engine into inspect mode and clears pins on exit', () => {
    const { engine, state } = fakeEngine();
    const c = component(engine);
    c.toggle();
    expect(c.active()).toBe(true);
    expect(state.inspectMode).toBe(true);
    expect(engine.inspectMode).toBe(true);
    c.pins.set([
      { n: 1, text: 'a', buildingId: null, design: null },
      { n: 2, text: 'b', buildingId: null, design: null },
    ]);
    c.toggle();
    expect(c.active()).toBe(false);
    expect(state.inspectMode).toBe(false);
    expect(c.pins()).toHaveLength(0);
  });

  it('ignores clicks while the engine is not in inspect mode', () => {
    const { engine } = fakeEngine();
    const c = component(engine);
    c.onContainerClick({ clientX: 10, clientY: 20 } as MouseEvent);
    expect(c.pins()).toHaveLength(0);
  });

  it('drops a pin card for an accepted click', () => {
    const { engine, state } = fakeEngine();
    vi.spyOn(engine, 'inspectAt').mockImplementation(() => {
      state.pinCount = 1;
      return {
        report: {
          x: 1,
          z: 2,
          lat: 1,
          lng: 2,
          road: null,
          node: null,
          building: null,
          nearby: [],
        },
        hit: null,
        buildingId: null,
      };
    });
    vi.spyOn(engine, 'reportText').mockReturnValue('report text');
    const c = component(engine);
    c.toggle();
    c.onContainerClick({ clientX: 10, clientY: 20 } as MouseEvent);
    expect(engine.pinCount).toBe(1);
    expect(c.pins()).toEqual([
      { n: 1, text: 'report text', buildingId: null, design: null },
    ]);
  });

  it('tags a pin that lands on a building with its id and drawn design', () => {
    const { engine, state } = fakeEngine();
    vi.spyOn(engine, 'inspectAt').mockImplementation(() => {
      state.pinCount = 1;
      return {
        report: {
          x: 1,
          z: 2,
          lat: 1,
          lng: 2,
          road: null,
          node: null,
          building: null,
          nearby: [],
        },
        hit: 'building #42 roof',
        buildingId: 42,
      };
    });
    vi.spyOn(engine, 'reportText').mockReturnValue('report text');
    vi.spyOn(engine, 'buildingDesign').mockReturnValue({ id: 'house', name: 'House' } as never);
    const c = component(engine);
    c.toggle();
    c.onContainerClick({ clientX: 10, clientY: 20 } as MouseEvent);
    expect(c.pins()[0].buildingId).toBe(42);
    expect(c.pins()[0].design).toEqual({ spec: 'house', name: 'House' });
  });

  it('writes a design pick into the working overrides and refreshes the pin', () => {
    const { engine } = fakeEngine();
    const set = vi.spyOn(engine, 'setBuildingOverride');
    vi.spyOn(engine, 'workingOverride').mockReturnValue(undefined);
    vi.spyOn(engine, 'buildingDesign').mockImplementation(((buildingId: number) =>
      buildingId === 42
        ? { id: 'tenement', name: 'Tenement' }
        : null) as never);
    const c = component(engine);
    const pin: InspectPin = { n: 1, text: 't', buildingId: 42, design: null };
    c.pins.set([pin]);
    c.onBuildingDesignChange(pin, 'tenement');
    expect(set).toHaveBeenCalledWith(42, { spec: 'tenement' });
    expect(c.pins()[0].design).toEqual({ spec: 'tenement', name: 'Tenement' });
  });

  it('writes spec null when "procedural" is chosen', () => {
    const { engine } = fakeEngine();
    const set = vi.spyOn(engine, 'setBuildingOverride');
    vi.spyOn(engine, 'workingOverride').mockReturnValue(undefined);
    vi.spyOn(engine, 'buildingDesign').mockReturnValue(null);
    const c = component(engine);
    const pin: InspectPin = { n: 1, text: 't', buildingId: 42, design: null };
    c.pins.set([pin]);
    c.onBuildingDesignChange(pin, 'procedural');
    expect(set).toHaveBeenCalledWith(42, { spec: null });
  });

  it('copies the working overrides JSON', () => {
    const { engine } = fakeEngine();
    vi.spyOn(engine, 'workingOverridesJson').mockReturnValue('{ "42": { "spec": "tenement" } }');
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    const c = component(engine);
    c.copyOverrides([
      { n: 1, text: 't', buildingId: 42, design: { spec: 'tenement', name: 'Tenement' } },
    ]);
    expect(clipboard.writeText).toHaveBeenCalledWith('{ "42": { "spec": "tenement" } }');
  });
});