import { RoadGraph } from './road-graph';
import { Route } from './route';
import { CarState, Vec2 } from './types';

export type Maneuver = 'straight' | 'left' | 'right' | 'uturn' | 'arrive';

export interface Guidance {
  maneuver: Maneuver;
  distanceToManeuver: number;
  aimX: number;
  aimZ: number;
  offRoute: boolean;
  remaining: number;
}

export interface RouteProgress {
  segmentIndex: number;
}

const TURN_ANGLE = Math.PI / 6;
const U_TURN_ANGLE = (5 * Math.PI) / 6;
const U_TURN_CAR = (2 * Math.PI) / 3;
const MANEUVER_DISTANCE = 60;
const AIM_DISTANCE = 20;
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

export function guide(
  route: Route,
  graph: RoadGraph,
  car: CarState,
  progress: RouteProgress,
): Guidance {
  const points = route.points;
  const cumulative = route.cumulative;
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
  if (distanceToEnd <= ARRIVE_DISTANCE) {
    return {
      maneuver: 'arrive',
      distanceToManeuver: remaining,
      aimX: end.x,
      aimZ: end.z,
      offRoute,
      remaining,
    };
  }

  const carForward: Vec2 = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
  const routeDirection = segmentDirection(points, bestSi);
  if (routeDirection && angleBetween(carForward, routeDirection) > U_TURN_CAR) {
    const aim = pointAtDistance(points, cumulative, distAlong, AIM_DISTANCE);
    return {
      maneuver: 'uturn',
      distanceToManeuver: 0,
      aimX: aim.x,
      aimZ: aim.z,
      offRoute,
      remaining,
    };
  }

  const loopStart = Math.max(1, bestSi);
  for (let k = loopStart; k < points.length - 1; k++) {
    const distance = cumulative[k] - distAlong;
    if (distance > MANEUVER_DISTANCE) break;
    if (graph.junction[route.nodes[k - 1]]) {
      const incoming = segmentDirection(points, k - 1);
      const outgoing = segmentDirection(points, k);
      if (incoming && outgoing) {
        const cross = incoming.x * outgoing.z - incoming.z * outgoing.x;
        const dot = clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1);
        const absAngle = Math.acos(dot);
        if (absAngle > TURN_ANGLE) {
          if (distance <= 0) {
            const angleFromOutgoing = angleBetween(carForward, outgoing);
            if (angleFromOutgoing > TURN_ANGLE) {
              const aim = pointAtDistance(points, cumulative, distAlong, AIM_DISTANCE);
              return {
                maneuver: 'uturn',
                distanceToManeuver: 0,
                aimX: aim.x,
                aimZ: aim.z,
                offRoute,
                remaining,
              };
            }
            continue;
          }
          const maneuver: Maneuver =
            absAngle >= U_TURN_ANGLE ? 'uturn' : cross > 0 ? 'right' : 'left';
          const aim = pointAtDistance(points, cumulative, distAlong, AIM_DISTANCE);
          return {
            maneuver,
            distanceToManeuver: distance,
            aimX: aim.x,
            aimZ: aim.z,
            offRoute,
            remaining,
          };
        }
      }
    }
  }

  const aim = pointAtDistance(points, cumulative, distAlong, AIM_DISTANCE);
  return {
    maneuver: 'straight',
    distanceToManeuver: 0,
    aimX: aim.x,
    aimZ: aim.z,
    offRoute,
    remaining,
  };
}