import * as THREE from 'three';
import { CarState } from '../sim/types';

const FIELD_OF_VIEW = 60;
const NEAR = 2;
const FAR = 2600;
const FOLLOW_DISTANCE = 12;
const FOLLOW_HEIGHT = 8;
const SMOOTHING = 0.001;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly desired = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private settled = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, aspect, NEAR, FAR);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  follow(car: CarState, dt: number): void {
    this.desired.set(
      car.position.x + Math.sin(car.heading) * FOLLOW_DISTANCE,
      FOLLOW_HEIGHT,
      car.position.z + Math.cos(car.heading) * FOLLOW_DISTANCE,
    );

    if (this.settled) {
      this.camera.position.lerp(this.desired, 1 - Math.pow(SMOOTHING, dt));
    } else {
      this.camera.position.copy(this.desired);
      this.settled = true;
    }

    this.lookTarget.set(car.position.x, 0, car.position.z);
    this.camera.lookAt(this.lookTarget);
  }
}
