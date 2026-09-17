import { buildRoadGraph } from './road-graph';
import { planRoute } from './route';
import { RouteStep } from './route-steps';
import { PolylineRoad } from './track';

function road(
  name: string,
  points: { x: number; z: number }[],
  overrides: Partial<PolylineRoad> = {},
): PolylineRoad {
  return {
    name,
    type: 'residential',
    lanes: 2,
    width: 8,
    oneway: 0,
    access: 'yes',
    points,
    ...overrides,
  };
}

function stepsOf(
  roads: PolylineRoad[],
  x: number,
  z: number,
  street: string,
  heading = 0,
): RouteStep[] {
  const graph = buildRoadGraph(roads);
  const route = planRoute(graph, roads, { position: { x, z }, heading }, street);
  if (!route) throw new Error('no route');
  return route.steps;
}

function maneuvers(steps: RouteStep[]): string[] {
  return steps.map((s) => s.maneuver);
}

describe('buildSteps', () => {
  it('renders a straight, a right, a straight and a left as depart, right, left, arrive', () => {
    const roads = [
      road('A', [{ x: 0, z: 0 }, { x: 0, z: 100 }]),
      road('B1', [{ x: 0, z: 100 }, { x: -50, z: 100 }]),
      road('B2', [{ x: -50, z: 100 }, { x: -100, z: 100 }]),
      road('C1', [{ x: 0, z: 50 }, { x: 0, z: 100 }, { x: 0, z: 150 }]),
      road('C2', [{ x: -50, z: 50 }, { x: -50, z: 100 }, { x: -50, z: 150 }]),
      road('Spur3', [{ x: -125, z: 100 }, { x: -100, z: 100 }]),
      road('D', [{ x: -100, z: 100 }, { x: -100, z: 150 }]),
      road('Goal', [{ x: -100, z: 150 }, { x: -100, z: 190 }]),
    ];

    const steps = stepsOf(roads, 0, 10, 'Goal');

    expect(maneuvers(steps)).toEqual(['depart', 'right', 'left', 'arrive']);
    expect(steps[0].maneuver).toBe('depart');
    expect(steps[0].at).toBeCloseTo(0, 3);
    expect(steps[0].street).toBe('A');
    expect(steps[1].maneuver).toBe('right');
    expect(steps[1].at).toBeCloseTo(90, 3);
    expect(steps[1].street).toBe('B1');
    expect(steps[2].maneuver).toBe('left');
    expect(steps[2].at).toBeCloseTo(190, 3);
    expect(steps[2].street).toBe('D');
    expect(steps[3].maneuver).toBe('arrive');
    expect(steps[3].at).toBeCloseTo(240, 3);
    expect(steps[3].street).toBe('Goal');
  });

  it('adds no step for a bend without a junction', () => {
    const roads = [
      road('Bend', [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 50, z: 100 }]),
      road('Goal', [{ x: 50, z: 100 }, { x: 50, z: 150 }]),
    ];

    const steps = stepsOf(roads, 0, 10, 'Goal');

    expect(maneuvers(steps)).toEqual(['depart', 'arrive']);
  });

  it('adds no step crossing a junction straight on, even when the street name changes', () => {
    const roads = [
      road('Leg1', [{ x: 0, z: 0 }, { x: 0, z: 100 }]),
      road('Leg2', [{ x: 0, z: 100 }, { x: 0, z: 200 }]),
      road('Cross', [{ x: -50, z: 100 }, { x: 0, z: 100 }, { x: 50, z: 100 }]),
      road('Goal', [{ x: 0, z: 200 }, { x: 0, z: 250 }]),
    ];

    const steps = stepsOf(roads, 0, 10, 'Goal');

    expect(maneuvers(steps)).toEqual(['depart', 'arrive']);
  });

  it('announces the turn when the car stands exactly on the starting junction', () => {
    const roads = [
      road('South', [{ x: 0, z: -100 }, { x: 0, z: 0 }]),
      road('East', [{ x: 0, z: 0 }, { x: 100, z: 0 }]),
      road('West', [{ x: -100, z: 0 }, { x: 0, z: 0 }]),
      road('Goal', [{ x: 100, z: 0 }, { x: 150, z: 0 }]),
    ];

    const steps = stepsOf(roads, 0, 0, 'Goal', Math.PI);

    expect(maneuvers(steps)).toEqual(['depart', 'left', 'arrive']);
    expect(steps[1].at).toBeCloseTo(0, 3);
    expect(steps[1].street).toBe('East');
  });

  it('announces the starting turn whatever order the roads at the junction are listed in', () => {
    const south = road('South', [{ x: 0, z: -100 }, { x: 0, z: 0 }]);
    const east = road('East', [{ x: 0, z: 0 }, { x: 100, z: 0 }]);
    const west = road('West', [{ x: -100, z: 0 }, { x: 0, z: 0 }]);
    const goal = road('Goal', [{ x: 100, z: 0 }, { x: 150, z: 0 }]);

    for (const roads of [
      [south, east, west, goal],
      [east, south, west, goal],
      [west, goal, east, south],
    ]) {
      const steps = stepsOf(roads, 0, 0, 'Goal', Math.PI);

      expect(maneuvers(steps), roads.map((r) => r.name).join(',')).toEqual(['depart', 'left', 'arrive']);
      expect(steps[1].at).toBeCloseTo(0, 3);
      expect(steps[1].street).toBe('East');
    }
  });

  it('emits uturn when the route reverses at a junction', () => {
    const roads = [
      road('Approach', [{ x: -100, z: 0 }, { x: 0, z: 0 }], { oneway: 1 }),
      road('Exit', [{ x: 0, z: 0 }, { x: -100, z: 0 }]),
      road('Spur', [{ x: 0, z: 0 }, { x: 0, z: 50 }]),
      road('Far', [{ x: -100, z: 0 }, { x: -100, z: -100 }]),
    ];

    const steps = stepsOf(roads, -50, 0, 'Far');

    expect(maneuvers(steps)).toEqual(['depart', 'uturn', 'arrive']);
    expect(steps[1].at).toBeCloseTo(50, 3);
    expect(steps[1].street).toBe('Exit');
  });

  it('goes around a one-way block and never uses the direct street', () => {
    const roads = [
      road('BlockSouth', [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 150, z: 0 }], { oneway: 1 }),
      road('BlockEast', [{ x: 100, z: 0 }, { x: 100, z: 100 }, { x: 100, z: 150 }]),
      road('BlockNorth', [{ x: 100, z: 100 }, { x: 0, z: 100 }, { x: -50, z: 100 }]),
      road('BlockWest', [{ x: 0, z: 100 }, { x: 0, z: 0 }, { x: 0, z: -50 }]),
      road('CutThrough', [{ x: 100, z: 50 }, { x: 0, z: 50 }], { oneway: 1 }),
      road('Goal', [{ x: 0, z: -50 }, { x: 0, z: -100 }]),
    ];

    const graph = buildRoadGraph(roads);
    const route = planRoute(graph, roads, { position: { x: 30, z: 0 }, heading: 0 }, 'Goal');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo(420, 1);

    const steps = route!.steps;
    expect(maneuvers(steps)).toEqual(['depart', 'right', 'right', 'right', 'arrive']);
    expect(steps[1].at).toBeCloseTo(70, 1);
    expect(steps[2].at).toBeCloseTo(170, 1);
    expect(steps[3].at).toBeCloseTo(270, 1);
    expect(steps[4].at).toBeCloseTo(420, 1);
    expect(steps[1].street).toBe('BlockEast');
    expect(steps[2].street).toBe('BlockNorth');
    expect(steps[3].street).toBe('BlockWest');

    for (const ride of route!.roads) {
      expect(roads[ride].name).not.toBe('CutThrough');
    }
  });

  it('leaves street empty for unnamed roads', () => {
    const roads = [
      road('', [{ x: 0, z: 0 }, { x: 0, z: 100 }]),
      road('Goal', [{ x: 0, z: 100 }, { x: 50, z: 100 }]),
    ];

    const steps = stepsOf(roads, 0, 10, 'Goal');

    expect(steps[0].street).toBe('');
  });
});