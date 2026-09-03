import { FixedStepLoop } from './loop';
import { createCarState, stepVehicle } from './sim/vehicle';

describe('FixedStepLoop', () => {
  it('runs sixty simulation steps for one second of elapsed time', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++, 1 / 60);

    for (let i = 0; i < 60; i++) {
      loop.advance(1 / 60);
    }

    expect(steps).toBe(60);
  });

  it('clamps a long stall instead of running unbounded steps', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++, 1 / 60, 0.25);

    loop.advance(10);

    expect(steps).toBe(15);
  });

  it('reports how far the render sits between simulation steps', () => {
    const loop = new FixedStepLoop(() => undefined, 1 / 60);

    const alpha = loop.advance(1 / 120);

    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('lands the car in the same place regardless of frame pacing', () => {
    const driveForTwoSeconds = (fps: number) => {
      let state = createCarState();
      const loop = new FixedStepLoop(
        (dt) => (state = stepVehicle(state, { throttle: 1, steer: 1, brake: false }, dt)),
        1 / 60,
      );
      for (let i = 0; i < fps * 2; i++) {
        loop.advance(1 / fps);
      }
      return state;
    };

    const at30 = driveForTwoSeconds(30);
    const at144 = driveForTwoSeconds(144);

    expect(at144.position.x).toBeCloseTo(at30.position.x, 6);
    expect(at144.position.z).toBeCloseTo(at30.position.z, 6);
    expect(at144.heading).toBeCloseTo(at30.heading, 6);
  });
});
