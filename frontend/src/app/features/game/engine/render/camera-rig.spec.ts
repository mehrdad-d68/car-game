import { CarState } from '../sim/types';
import { CameraRig } from './camera-rig';

const AT_ORIGIN: CarState = { position: { x: 0, z: 0 }, heading: 0, speed: 0 };

describe('CameraRig', () => {
  it('settles behind and above a stationary car', () => {
    const rig = new CameraRig(16 / 9);

    for (let i = 0; i < 300; i++) {
      rig.follow(AT_ORIGIN, 1 / 60);
    }

    expect(rig.camera.position.z).toBeCloseTo(12, 2);
    expect(rig.camera.position.y).toBeCloseTo(8, 2);
    expect(rig.camera.position.x).toBeCloseTo(0, 2);
  });

  it('swings to the other side of the car when it faces the opposite way', () => {
    const rig = new CameraRig(16 / 9);
    const facingBackwards: CarState = { ...AT_ORIGIN, heading: Math.PI };

    for (let i = 0; i < 300; i++) {
      rig.follow(facingBackwards, 1 / 60);
    }

    expect(rig.camera.position.z).toBeCloseTo(-12, 2);
  });
});
