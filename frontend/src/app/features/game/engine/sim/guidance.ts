import { Route } from './route';
import type { RouteStep } from './route-steps';
import { CarState, Vec2 } from './types';

export type Maneuver = 'straight' | 'left' | 'right' | 'uturn' | 'arrive';

export interface Guidance {
  maneuver: Maneuver;
  distanceToManeuver: number;
  distanceToStep: number;
  arrowYaw: number;
  arrowX: number;
  arrowZ: number;
  nextStep: RouteStep | null;
  offRoute: boolean;
  remaining: number;
}

export interface RouteProgress {
  segmentIndex: number;
}

const U_TURN_CAR = (2 * Math.PI) / 3;
export const MANEUVER_DISTANCE = 60;
export const TURN_SHOW_DISTANCE = 30;
const ARROW_AHEAD = 8;
const ARRIVE_DISTANCE = 15;
const OFF_ROUTE_LATERAL = 25;
const SEGMENTS_AHEAD = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function angleBetween(a: Vec2, b: Vec2): number {
  const dot = clamp(a.x * b.x + a.z * b.z, -1, 1);
  return Math.acos(dot);
}

function segmentDirection(points: Vec2[], index: number): Vec2 | null {
  for (let i = index; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    return { x: dx / len, z: dz / len };
  }
  return null;
}

function toYaw(direction: Vec2): number {
  return Math.atan2(direction.x, direction.z);
}

function pointAtDistance(
  points: Vec2[],
  cumulative: number[],
  fromDist: number,
  distance: number,
): Vec2 {
  let target = fromDist + distance;
  const end = points[points.length - 1];
  const total = cumulative[cumulative.length - 1];
  if (target >= total) return end;

  let index = 0;
  while (index < cumulative.length - 2 && cumulative[index + 1] < target) {
    index++;
  }
  const segLen = cumulative[index + 1] - cumulative[index];
  const t = segLen > 0 ? clamp((target - cumulative[index]) / segLen, 0, 1) : 0;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * t,
    z: points[index].z + (points[index + 1].z - points[index].z) * t,
  };
}

function segmentIndexAt(
  points: Vec2[],
  cumulative: number[],
  along: number,
): number {
  for (let i = 0; i < points.length - 1; i++) {
    if (along <= cumulative[i + 1] + 1e-6) return i;
  }
  return points.length - 2;
}

export function guide(
  route: Route,
  car: CarState,
  progress: RouteProgress,
): Guidance {
  const points = route.points;
  const cumulative = route.cumulative;
  const steps = route.steps;
  const lastSegment = points.length - 2;

  let start = progress.segmentIndex;
  if (start < 0) start = 0;
  if (start > lastSegment) start = lastSegment;
  const windowEnd = Math.min(start + SEGMENTS_AHEAD, lastSegment);

  let bestSi = start;
  let bestT = 0;
  let bestLateral = Infinity;
  for (let i = start; i <= windowEnd; i++) {
    const segLen = cumulative[i + 1] - cumulative[i];
    if (segLen < 1e-9) continue;
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const t = clamp(
      ((car.position.x - points[i].x) * dx + (car.position.z - points[i].z) * dz) / (segLen * segLen),
      0,
      1,
    );
    const px = points[i].x + dx * t;
    const pz = points[i].z + dz * t;
    const lateral = Math.hypot(car.position.x - px, car.position.z - pz);
    if (lateral < bestLateral) {
      bestLateral = lateral;
      bestSi = i;
      bestT = t;
    }
  }
  progress.segmentIndex = bestSi;

  const distAlong = cumulative[bestSi] + (cumulative[bestSi + 1] - cumulative[bestSi]) * bestT;
  const remaining = route.length - distAlong;
  const offRoute = bestLateral > OFF_ROUTE_LATERAL;

  const end = points[points.length - 1];
  const distanceToEnd = Math.hypot(car.position.x - end.x, car.position.z - end.z);

  let nextStep: RouteStep | null = null;
  for (const step of steps) {
    if (step.maneuver === 'depart') continue;
    if (step.at >= distAlong) {
      nextStep = step;
      break;
    }
  }
  if (!nextStep && steps.length > 0) nextStep = steps[steps.length - 1];
  const distanceToStep = nextStep ? Math.max(0, nextStep.at - distAlong) : remaining;

  const carForward: Vec2 = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
  const streetDir = segmentDirection(points, bestSi);
  const arrowPoint = pointAtDistance(points, cumulative, distAlong, ARROW_AHEAD);

  if (distanceToEnd <= ARRIVE_DISTANCE) {
    return {
      maneuver: 'arrive',
      distanceToManeuver: remaining,
      distanceToStep,
      arrowYaw: streetDir ? toYaw(streetDir) : 0,
      arrowX: end.x,
      arrowZ: end.z,
      nextStep,
      offRoute,
      remaining,
    };
  }

  if (streetDir && angleBetween(carForward, streetDir) > U_TURN_CAR) {
    return {
      maneuver: 'uturn',
      distanceToManeuver: 0,
      distanceToStep,
      arrowYaw: toYaw(streetDir),
      arrowX: car.position.x + carForward.x * ARROW_AHEAD,
      arrowZ: car.position.z + carForward.z * ARROW_AHEAD,
      nextStep,
      offRoute,
      remaining,
    };
  }

  const isTurn =
    nextStep !== null &&
    (nextStep.maneuver === 'left' ||
      nextStep.maneuver === 'right' ||
      nextStep.maneuver === 'uturn');

  let maneuver: Maneuver = 'straight';
  if (isTurn && distanceToStep <= MANEUVER_DISTANCE) {
    maneuver = nextStep!.maneuver as Maneuver;
  }

  let arrowYaw = toYaw(
    segmentDirection(points, segmentIndexAt(points, cumulative, distAlong + ARROW_AHEAD)) ??
      streetDir ??
      carForward,
  );
  if (maneuver !== 'straight' && distanceToStep <= TURN_SHOW_DISTANCE) {
    arrowYaw = nextStep!.outYaw;
  }

  return {
    maneuver,
    distanceToManeuver: distanceToStep,
    distanceToStep,
    arrowYaw,
    arrowX: arrowPoint.x,
    arrowZ: arrowPoint.z,
    nextStep,
    offRoute,
    remaining,
  };
}