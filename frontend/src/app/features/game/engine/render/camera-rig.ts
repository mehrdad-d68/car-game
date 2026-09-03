import * as THREE from 'three';
import { CarState } from '../sim/types';

const FIELD_OF_VIEW = 60;
const NEAR = 0.1;
const FAR = 1000;
const FOLLOW_DISTANCE = 6.5;
const FOLLOW_HEIGHT = 4.5;
const SMOOTHING = 0.001;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly desired = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

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

    this.camera.position.lerp(this.desired, 1 - Math.pow(SMOOTHING, dt));

    this.lookTarget.set(car.position.x, 0, car.position.z);
    this.camera.lookAt(this.lookTarget);
  }
}
