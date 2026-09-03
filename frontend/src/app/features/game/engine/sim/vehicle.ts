import { InputFrame } from '../ports';
import { CarState } from './types';

const ENGINE_POWER = 18;
const TURN_RATE = 2.4;
const STEERING_SPEED = 6;
const ROLLING_RESISTANCE = 3.5;
const BRAKE_POWER = 24;
const DRAG = 0.7;

function decelerate(speed: number, amount: number): number {
  return Math.abs(speed) <= amount ? 0 : speed - Math.sign(speed) * amount;
}

export function createCarState(): CarState {
  return { position: { x: 0, z: 0 }, heading: 0, speed: 0 };
}

export function stepVehicle(state: CarState, input: InputFrame, dt: number): CarState {
  let speed = state.speed + input.throttle * ENGINE_POWER * dt;
  speed -= speed * DRAG * dt;

  if (input.brake) {
    speed = decelerate(speed, BRAKE_POWER * dt);
  } else if (input.throttle === 0) {
    speed = decelerate(speed, ROLLING_RESISTANCE * dt);
  }

  const grip = Math.min(Math.abs(speed) / STEERING_SPEED, 1);
  const heading = state.heading + input.steer * TURN_RATE * grip * Math.sign(speed) * dt;

  return {
    position: {
      x: state.position.x - Math.sin(heading) * speed * dt,
      z: state.position.z - Math.cos(heading) * speed * dt,
    },
    heading,
    speed,
  };
}
