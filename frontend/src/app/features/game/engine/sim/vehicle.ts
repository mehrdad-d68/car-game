import { InputFrame } from '../ports';
import { CarHandling } from './car-spec';
import { Spawn } from './track';
import { CarState } from './types';

const ORIGIN_SPAWN: Spawn = { position: { x: 0, z: 0 }, heading: 0 };

export const DEFAULT_HANDLING: CarHandling = {
  enginePower: 18,
  turnRate: 2.4,
  steeringSpeed: 6,
  rollingResistance: 3.5,
  brakePower: 24,
  drag: 0.7,
  maxReverseSpeed: 8,
};

function decelerate(speed: number, amount: number): number {
  return Math.abs(speed) <= amount ? 0 : speed - Math.sign(speed) * amount;
}

export function createCarState(spawn: Spawn = ORIGIN_SPAWN): CarState {
  return { position: { ...spawn.position }, heading: spawn.heading, speed: 0 };
}

export function stepVehicle(
  state: CarState,
  input: InputFrame,
  dt: number,
  handling: CarHandling = DEFAULT_HANDLING,
): CarState {
  let speed = state.speed + input.throttle * handling.enginePower * dt;
  speed -= speed * handling.drag * dt;
  speed = Math.max(speed, -handling.maxReverseSpeed);

  if (input.brake) {
    speed = decelerate(speed, handling.brakePower * dt);
  } else if (input.throttle === 0) {
    speed = decelerate(speed, handling.rollingResistance * dt);
  }

  const grip = Math.min(Math.abs(speed) / handling.steeringSpeed, 1);
  const heading =
    state.heading +
    input.steer * handling.turnRate * grip * Math.sign(speed) * dt;

  return {
    position: {
      x: state.position.x - Math.sin(heading) * speed * dt,
      z: state.position.z - Math.cos(heading) * speed * dt,
    },
    heading,
    speed,
  };
}

export function interpolateCarState(
  previous: CarState,
  current: CarState,
  alpha: number,
): CarState {
  return {
    position: {
      x: previous.position.x + (current.position.x - previous.position.x) * alpha,
      z: previous.position.z + (current.position.z - previous.position.z) * alpha,
    },
    heading: previous.heading + (current.heading - previous.heading) * alpha,
    speed: previous.speed + (current.speed - previous.speed) * alpha,
  };
}
