import { Guidance } from './guidance';
import {
  advanceNavigation,
  ARRIVE_HOLD,
  createNavigationTimers,
  OFF_ROUTE_HOLD,
  REPLAN_INTERVAL,
} from './navigation';

type Signal = Pick<Guidance, 'maneuver' | 'offRoute'>;

const driving: Signal = { maneuver: 'straight', offRoute: false };
const arriving: Signal = { maneuver: 'arrive', offRoute: false };
const lost: Signal = { maneuver: 'straight', offRoute: true };

function run(signal: Signal, seconds: number, step = 0.5) {
  const timers = createNavigationTimers();
  const actions: string[] = [];
  for (let i = 1; i <= Math.round(seconds / step); i++) {
    actions.push(advanceNavigation(timers, signal, step, i * step));
  }
  return { timers, actions };
}

describe('advanceNavigation', () => {
  it('holds while the car is driving the route', () => {
    const { actions } = run(driving, 10);
    expect(actions.every((a) => a === 'hold')).toBe(true);
  });

  it('clears the route once the car has been arriving for the hold time', () => {
    const { actions } = run(arriving, ARRIVE_HOLD + 1);
    expect(actions).toContain('clear');
    // Not before the hold has actually elapsed.
    expect(actions.indexOf('clear')).toBe(ARRIVE_HOLD / 0.5 - 1);
  });

  it('clears when the car stops at the destination rather than driving past it', () => {
    // The arrow says "arrive" from 15 m out; the car stops there and never gets closer.
    const timers = createNavigationTimers();
    let action = 'hold';
    for (let i = 1; i <= (ARRIVE_HOLD + 1) / 0.5; i++) {
      action = advanceNavigation(timers, arriving, 0.5, i * 0.5);
      if (action === 'clear') break;
    }
    expect(action).toBe('clear');
  });

  it('does not clear while the arrow still shows a maneuver', () => {
    const { actions } = run(driving, ARRIVE_HOLD * 3);
    expect(actions).not.toContain('clear');
  });

  it('resets the arrive timer if the car leaves the arrival area again', () => {
    const timers = createNavigationTimers();
    advanceNavigation(timers, arriving, 0.5, 0.5);
    expect(timers.arriveSeconds).toBeGreaterThan(0);
    advanceNavigation(timers, driving, 0.5, 1);
    expect(timers.arriveSeconds).toBe(0);
  });

  it('asks for a replan only after the off-route hold has elapsed', () => {
    // 0.5 is exact in binary, so the step that crosses OFF_ROUTE_HOLD lands precisely on it.
    const step = 0.5;
    const steps = OFF_ROUTE_HOLD / step;
    const timers = createNavigationTimers();
    const actions: string[] = [];
    for (let i = 1; i <= steps; i++) {
      actions.push(advanceNavigation(timers, lost, step, i * step));
    }
    expect(actions.slice(0, -1).every((a) => a === 'hold')).toBe(true);
    expect(actions.at(-1)).toBe('replan');
  });

  it('throttles repeated replans while the car stays off route', () => {
    const step = 0.5;
    const seconds = 10;
    const timers = createNavigationTimers();
    let replans = 0;
    for (let i = 1; i <= seconds / step; i++) {
      if (advanceNavigation(timers, lost, step, i * step) === 'replan') replans++;
    }
    // One replan after the hold, then at most one per REPLAN_INTERVAL for the rest of the run.
    expect(replans).toBeGreaterThan(0);
    expect(replans).toBeLessThanOrEqual(Math.ceil((seconds - OFF_ROUTE_HOLD) / REPLAN_INTERVAL) + 1);
  });

  it('forgets being off route as soon as the car rejoins', () => {
    const timers = createNavigationTimers();
    advanceNavigation(timers, lost, 0.5, 0.5);
    expect(timers.offRouteSeconds).toBeGreaterThan(0);
    advanceNavigation(timers, driving, 0.5, 1);
    expect(timers.offRouteSeconds).toBe(0);
  });

  it('prefers replanning over clearing when the car is off route at the destination', () => {
    const step = 0.5;
    const timers = createNavigationTimers();
    let action = 'hold';
    for (let i = 1; i <= OFF_ROUTE_HOLD / step; i++) {
      action = advanceNavigation(timers, { maneuver: 'arrive', offRoute: true }, step, i * step);
    }
    expect(action).toBe('replan');
  });
});
