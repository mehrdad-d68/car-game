import { guide, Maneuver, RouteProgress } from './guidance';
import { buildRoadGraph } from './road-graph';
import { planRoute } from './route';
import { PolylineRoad as Road } from './track';
import { CarState } from './types';

function road(
  name: string,
  points: { x: number; z: number }[],
  overrides: Partial<Road> = {},
): Road {
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

function crossroad(): Road[] {
  return [
    road('North', [
      { x: 0, z: -100 },
      { x: 0, z: -80 },
      { x: 0, z: -40 },
      { x: 0, z: 20 },
    ]),
    road('East', [
      { x: 0, z: -80 },
      { x: 50, z: -80 },
      { x: 120, z: -80 },
    ]),
    road('West', [
      { x: -120, z: -80 },
      { x: -50, z: -80 },
      { x: 0, z: -80 },
    ]),
    road('Harbor', [
      { x: 120, z: -80 },
      { x: 180, z: -80 },
    ]),
  ];
}

function drive(roads: Road[], car: CarState, street: string): ReturnType<typeof guide> {
  const graph = buildRoadGraph(roads);
  const route = planRoute(graph, roads, { position: car.position, heading: car.heading }, street);
  const progress: RouteProgress = { segmentIndex: 0 };
  return guide(route!, graph, car, progress);
}

function car(x: number, z: number, heading: number): CarState {
  return { position: { x, z }, heading, speed: 20 };
}

describe('guide', () => {
  it('says right when the route turns right at the next junction', () => {
    const result = drive(crossroad(), car(0, -50, 0), 'Harbor');
    expect(result.maneuver).toBe('right');
    expect(result.distanceToManeuver).toBeCloseTo(30, 1);
    expect(result.offRoute).toBe(false);
  });

  it('says left when the route turns left at the next junction', () => {
    const roads = crossroad().map((r) =>
      r.name === 'Harbor' ? road('Harbor', [{ x: -120, z: -80 }, { x: -180, z: -80 }]) : r,
    );
    const result = drive(roads, car(0, -50, 0), 'Harbor');
    expect(result.maneuver).toBe('left');
    expect(result.distanceToManeuver).toBeCloseTo(30, 1);
  });

  it('says uturn when the way forward is behind the car', () => {
    const result = drive(
      [
        road('South', [{ x: 0, z: -20 }, { x: 0, z: 100 }]),
        road('Terminus', [{ x: 0, z: 100 }, { x: 50, z: 100 }]),
      ],
      car(0, 0, 0),
      'Terminus',
    );
    expect(result.maneuver).toBe('uturn');
  });

  it('says straight when the turn is beyond 60 m', () => {
    const result = drive(crossroad(), car(0, -10, 0), 'Harbor');
    expect(result.maneuver).toBe('straight');
  });

  it('says the maneuver once it is within 60 m', () => {
    const result = drive(crossroad(), car(0, -30, 0), 'Harbor');
    expect(result.maneuver).toBe('right');
    expect(result.distanceToManeuver).toBeCloseTo(50, 1);
  });

  it('does not treat a bend without a junction as a maneuver', () => {
    const roads = [
      road('S', [{ x: 0, z: 180 }, { x: 0, z: 100 }, { x: 50, z: 100 }]),
      road('E', [{ x: 50, z: 100 }, { x: 150, z: 100 }]),
    ];
    const result = drive(roads, car(0, 160, 0), 'E');
    expect(result.maneuver).toBe('straight');
    expect(result.offRoute).toBe(false);
  });

  it('says arrive within 15 m of the end', () => {
    const result = drive([road('Goal', [{ x: 0, z: -5 }, { x: 0, z: -100 }])], car(0, -12, 0), 'Goal');
    expect(result.maneuver).toBe('arrive');
    expect(result.remaining).toBeLessThanOrEqual(15);
  });

  it('flags the car as off route when it is far from the route', () => {
    const result = drive([road('R', [{ x: 0, z: -100 }, { x: 0, z: -5 }])], car(30, -50, Math.PI), 'R');
    expect(result.offRoute).toBe(true);
  });

  it('says uturn after the car passes a right junction and keeps going straight', () => {
    const result = drive(crossroad(), car(0, -90, 0), 'Harbor');
    expect(result.maneuver).toBe('uturn');
  });

  it('says uturn after the car passes a left junction and keeps going straight', () => {
    const roads = crossroad().map((r) =>
      r.name === 'Harbor' ? road('Harbor', [{ x: -120, z: -80 }, { x: -180, z: -80 }]) : r,
    );
    const result = drive(roads, car(0, -90, 0), 'Harbor');
    expect(result.maneuver).toBe('uturn');
  });

  it('does not say uturn when the car is aligned with the outgoing road', () => {
    const result = drive(crossroad(), car(10, -80, -Math.PI / 2), 'Harbor');
    expect(result.maneuver).toBe('straight');
  });

  it('progresses the search window as the car advances', () => {
    const roads = crossroad();
    const graph = buildRoadGraph(roads);
    const route = planRoute(
      graph,
      roads,
      { position: { x: 0, z: -50 }, heading: 0 },
      'Harbor',
    )!;
    const progress: RouteProgress = { segmentIndex: 0 };

    expect(guide(route, graph, car(0, -50, 0), progress).maneuver).toBe('right');
    expect(progress.segmentIndex).toBe(0);

    guide(route, graph, car(20, -80, 0), progress);
    expect(progress.segmentIndex).toBeGreaterThan(0);
  });
});