import { InputFrame } from '../ports';
import { createCarState, stepVehicle } from './vehicle';

const IDLE: InputFrame = { throttle: 0, steer: 0, brake: false };
const DT = 1 / 60;

describe('stepVehicle', () => {
  it('moves the car forward when the throttle is applied', () => {
    let state = createCarState();

    state = stepVehicle(state, { ...IDLE, throttle: 1 }, DT);

    expect(state.speed).toBeGreaterThan(0);
    expect(state.position.z).toBeLessThan(0);
  });

  it('turns the car while it is moving', () => {
    let state = createCarState();
    for (let i = 0; i < 60; i++) {
      state = stepVehicle(state, { ...IDLE, throttle: 1 }, DT);
    }
    const headingBefore = state.heading;

    state = stepVehicle(state, { ...IDLE, throttle: 1, steer: 1 }, DT);

    expect(state.heading).toBeGreaterThan(headingBefore);
  });

  it('does not turn the car while it is stationary', () => {
    const state = createCarState();

    const next = stepVehicle(state, { ...IDLE, steer: 1 }, DT);

    expect(next.heading).toBe(0);
  });

  it('coasts to a standstill when the throttle is released', () => {
    let state = createCarState();
    for (let i = 0; i < 60; i++) {
      state = stepVehicle(state, { ...IDLE, throttle: 1 }, DT);
    }

    for (let i = 0; i < 900; i++) {
      state = stepVehicle(state, IDLE, DT);
    }

    expect(state.speed).toBe(0);
  });

  it('slows the car faster under braking than under coasting', () => {
    let braked = createCarState();
    let coasted = createCarState();
    for (let i = 0; i < 60; i++) {
      braked = stepVehicle(braked, { ...IDLE, throttle: 1 }, DT);
      coasted = stepVehicle(coasted, { ...IDLE, throttle: 1 }, DT);
    }

    for (let i = 0; i < 20; i++) {
      braked = stepVehicle(braked, { ...IDLE, brake: true }, DT);
      coasted = stepVehicle(coasted, IDLE, DT);
    }

    expect(braked.speed).toBeLessThan(coasted.speed);
  });

  it('produces identical state for identical input sequences', () => {
    const script: InputFrame[] = Array.from({ length: 240 }, (_, i) => ({
      throttle: i < 120 ? 1 : -1,
      steer: Math.sin(i / 12) > 0 ? 1 : -1,
      brake: i % 37 === 0,
    }));
    const drive = () => script.reduce((state, frame) => stepVehicle(state, frame, DT), createCarState());

    expect(drive()).toEqual(drive());
  });

  it('caps reverse speed at 8 units/s', () => {
    let state = createCarState();
    for (let i = 0; i < 600; i++) {
      state = stepVehicle(state, { ...IDLE, throttle: -1 }, DT);
    }
    expect(state.speed).toBeCloseTo(-8, 3);
    expect(state.speed).toBeGreaterThanOrEqual(-8);
  });
});
