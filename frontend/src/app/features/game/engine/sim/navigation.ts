import { Guidance } from './guidance';

export const OFF_ROUTE_HOLD = 1.5;
export const REPLAN_INTERVAL = 2;
export const ARRIVE_HOLD = 2;

export interface NavigationTimers {
  offRouteSeconds: number;
  arriveSeconds: number;
  lastReplanSeconds: number;
}

export type NavigationAction = 'hold' | 'replan' | 'clear';

export function createNavigationTimers(): NavigationTimers {
  return { offRouteSeconds: 0, arriveSeconds: 0, lastReplanSeconds: -Infinity };
}

/**
 * Advances the route lifecycle by one simulation step and says what the engine should do.
 * Mutates `timers`.
 */
export function advanceNavigation(
  timers: NavigationTimers,
  guidance: Pick<Guidance, 'maneuver' | 'offRoute'>,
  dt: number,
  now: number,
): NavigationAction {
  if (guidance.offRoute) {
    timers.offRouteSeconds += dt;
    if (
      timers.offRouteSeconds >= OFF_ROUTE_HOLD &&
      now - timers.lastReplanSeconds >= REPLAN_INTERVAL
    ) {
      timers.lastReplanSeconds = now;
      return 'replan';
    }
  } else {
    timers.offRouteSeconds = 0;
  }

  // Tear down on the same signal the arrow shows the player. A tighter distance check would
  // leave the route running for anyone who stops where the arrow told them to, because the
  // remaining distance only reaches zero if they drive past the destination.
  if (guidance.maneuver === 'arrive') {
    timers.arriveSeconds += dt;
    if (timers.arriveSeconds >= ARRIVE_HOLD) return 'clear';
  } else {
    timers.arriveSeconds = 0;
  }

  return 'hold';
}
