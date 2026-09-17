import type { RoadGraph } from './road-graph';
import type { Route } from './route';
import type { PolylineRoad } from './track';

export type StepManeuver = 'depart' | 'left' | 'right' | 'uturn' | 'arrive';

export interface RouteStep {
  maneuver: StepManeuver;
  at: number;
  street: string;
  inYaw: number;
  outYaw: number;
}

const TURN_ANGLE = Math.PI / 6;
const U_TURN_ANGLE = (5 * Math.PI) / 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

function segmentYaw(points: { x: number; z: number }[], index: number): number | null {
  const dx = points[index + 1].x - points[index].x;
  const dz = points[index + 1].z - points[index].z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  return yawOf(dx / len, dz / len);
}

function streetName(roads: PolylineRoad[], roadId: number): string {
  const road = roads[roadId];
  return road && road.name ? road.name.trim() : '';
}

export function buildSteps(
  route: Route,
  graph: RoadGraph,
  roads: PolylineRoad[],
  startHeading: number,
): RouteStep[] {
  const points = route.points;
  const steps: RouteStep[] = [];

  const startYaw = yawOf(-Math.sin(startHeading), -Math.cos(startHeading));
  const departYaw = segmentYaw(points, 0) ?? startYaw;
  steps.push({
    maneuver: 'depart',
    at: 0,
    street: streetName(roads, route.roads[0]),
    inYaw: departYaw,
    outYaw: departYaw,
  });

  for (let j = 0; j < route.nodes.length - 1; j++) {
    const node = route.nodes[j];
    if (!graph.junction[node]) continue;
    const incoming = segmentYaw(points, j) ?? (j === 0 ? startYaw : null);
    const outgoing = segmentYaw(points, j + 1);
    if (incoming === null || outgoing === null) continue;

    const aX = Math.sin(incoming);
    const aZ = Math.cos(incoming);
    const bX = Math.sin(outgoing);
    const bZ = Math.cos(outgoing);
    const cross = aX * bZ - aZ * bX;
    const dot = clamp(aX * bX + aZ * bZ, -1, 1);
    const absAngle = Math.acos(dot);

    let maneuver: StepManeuver;
    if (absAngle >= U_TURN_ANGLE) {
      maneuver = 'uturn';
    } else if (absAngle <= TURN_ANGLE) {
      continue;
    } else {
      maneuver = cross > 0 ? 'right' : 'left';
    }

    steps.push({
      maneuver,
      at: route.cumulative[j + 1],
      street: streetName(roads, route.roads[j + 1]),
      inYaw: incoming,
      outYaw: outgoing,
    });
  }

  const arriveYaw = segmentYaw(points, points.length - 2) ?? departYaw;
  steps.push({
    maneuver: 'arrive',
    at: route.length,
    street: route.street,
    inYaw: arriveYaw,
    outYaw: arriveYaw,
  });

  return steps;
}