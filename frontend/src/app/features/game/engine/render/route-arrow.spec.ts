import { Guidance } from '../sim/guidance';
import { CarState } from '../sim/types';
import { RouteArrow } from './route-arrow';
import * as THREE from 'three';

const AT_REST: CarState = { position: { x: 0, z: 0 }, heading: 0, speed: 0 };

function guidance(
  overrides: Partial<Guidance> = {},
): Guidance {
  return {
    maneuver: 'straight',
    distanceToManeuver: 0,
    distanceToStep: 0,
    arrowYaw: Math.PI,
    arrowX: 0,
    arrowZ: -8,
    nextStep: null,
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

function chevronWorldX(arrow: RouteArrow): number {
  const view = arrow.group.children.find((child) => child.visible);
  const chevron = view?.getObjectByName('chevron');
  if (!chevron) return NaN;
  return chevron.getWorldPosition(new THREE.Vector3()).x;
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

  it('shows a u-turn glyph with a loop when the maneuver is uturn', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ maneuver: 'uturn', arrowX: 0, arrowZ: -8 }), 1);
    expect(visibleViews(arrow)).toEqual(['uturn']);

    const uturn = arrow.group.getObjectByName('uturn')!;
    expect(uturn.getObjectByName('loop')).not.toBeNull();
    expect(arrow.group.position.x).toBeCloseTo(0, 5);
    expect(arrow.group.position.z).toBeCloseTo(-8, 5);
  });

  it('sits at the point on the route from guidance', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ arrowX: 5, arrowZ: -20 }), 1);
    expect(arrow.group.position.x).toBeCloseTo(5, 5);
    expect(arrow.group.position.z).toBeCloseTo(-20, 5);
  });

  it('yaws toward the guidance yaw', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ arrowYaw: Math.PI / 2 }), 1);
    expect(arrow.group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it('shows the side chevron while a turn is 30–60 m ahead', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ maneuver: 'right', distanceToManeuver: 45 }), 1);
    expect(arrow.chevronShown).toBe(true);
  });

  it('hides the side chevron once the body swings toward the turn', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ maneuver: 'right', distanceToManeuver: 20 }), 1);
    expect(arrow.chevronShown).toBe(false);
  });

  it('hides the side chevron when the maneuver is straight', () => {
    const arrow = new RouteArrow();
    arrow.update(AT_REST, guidance({ maneuver: 'straight', distanceToManeuver: 45 }), 1);
    expect(arrow.chevronShown).toBe(false);
  });

  it('sits on the world-right side for a right turn and world-left for a left turn', () => {
    const arrow = new RouteArrow();
    arrow.update(
      AT_REST,
      guidance({ maneuver: 'right', arrowYaw: Math.PI, distanceToManeuver: 45 }),
      1,
    );
    expect(chevronWorldX(arrow)).toBeGreaterThan(0);

    arrow.update(
      AT_REST,
      guidance({ maneuver: 'left', arrowYaw: Math.PI, distanceToManeuver: 45 }),
      1,
    );
    expect(chevronWorldX(arrow)).toBeLessThan(0);
  });

  it('is disposed cleanly', () => {
    const arrow = new RouteArrow();
    expect(() => arrow.dispose()).not.toThrow();
  });
});