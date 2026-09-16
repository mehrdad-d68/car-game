import { Guidance } from '../sim/guidance';
import { CarState } from '../sim/types';
import { RouteArrow } from './route-arrow';

const AT_REST: CarState = { position: { x: 0, z: 0 }, heading: 0, speed: 0 };

function guidance(
  overrides: Partial<Guidance> = {},
): Guidance {
  return {
    maneuver: 'straight',
    distanceToManeuver: 0,
    aimX: 0,
    aimZ: -28,
    offRoute: false,
    remaining: 100,
    ...overrides,
  };
}

function visibleViews(arrow: RouteArrow): string[] {
  return arrow.group.children
    .filter((child) => child.visible)
    .map((child) => child.name);
}

describe('RouteArrow', () => {
  it('is hidden when there is no route', () => {
    const arrow = new RouteArrow();
    expect(arrow.group.visible).toBe(false);
    arrow.update(AT_REST, null, 1 / 60);
    expect(arrow.group.visible).toBe(false);
  });

  it('shows exactly the mesh for the current maneuver', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ maneuver: 'right' }), 1);
    expect(visibleViews(arrow)).toEqual(['right']);

    arrow.update(AT_REST, guidance({ maneuver: 'arrive' }), 1);
    expect(visibleViews(arrow)).toEqual(['arrive']);
  });

  it('moves ahead of the car in front of the driving direction', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance(), 1);
    expect(arrow.group.position.x).toBeCloseTo(0);
    expect(arrow.group.position.z).toBeCloseTo(-8, 5);
  });

  it('yaws toward the aim point', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ aimX: 10, aimZ: 0 }), 1);
    expect(arrow.group.rotation.y).toBeCloseTo(Math.atan2(10, 8), 5);
  });

  it('is disposed cleanly', () => {
    const arrow = new RouteArrow();
    expect(() => arrow.dispose()).not.toThrow();
  });
});