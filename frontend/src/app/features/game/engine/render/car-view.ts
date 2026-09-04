import * as THREE from 'three';
import { CarState } from '../sim/types';
import { ROAD_HEIGHT } from './constants';

const WHEEL_POSITIONS: [number, number, number][] = [
  [-0.95, 0.32, 1.2],
  [0.95, 0.32, 1.2],
  [-0.95, 0.32, -1.2],
  [0.95, 0.32, -1.2],
];

export class CarView {
  readonly group = new THREE.Group();

  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.build();
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private build(): void {
    const bodyMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd32f2f }));
    const glassMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x90caf9, metalness: 0.4, roughness: 0.2 }),
    );
    const wheelMat = this.track(new THREE.MeshStandardMaterial({ color: 0x212121 }));
    const headlightMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfff9c4,
        emissive: 0xffff99,
        emissiveIntensity: 0.6,
      }),
    );
    const tailMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xff5252, emissive: 0xff0000, emissiveIntensity: 0.4 }),
    );

    const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.8, 0.5, 3.6)), bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    this.group.add(body);

    const cabin = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.4, 0.45, 1.6)), glassMat);
    cabin.position.set(0, 0.85, -0.2);
    this.group.add(cabin);

    const wheelGeo = this.track(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 16));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, y, z] of WHEEL_POSITIONS) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(x, y, z);
      this.group.add(wheel);
    }

    const lampGeo = this.track(new THREE.BoxGeometry(0.3, 0.15, 0.05));
    for (const x of [-0.5, 0.5]) {
      const headlight = new THREE.Mesh(lampGeo, headlightMat);
      headlight.position.set(x, 0.35, 1.8);
      const taillight = new THREE.Mesh(lampGeo, tailMat);
      taillight.position.set(x, 0.35, -1.8);
      this.group.add(headlight, taillight);
    }
  }

  sync(previous: CarState, current: CarState, alpha: number): void {
    this.group.position.set(
      previous.position.x + (current.position.x - previous.position.x) * alpha,
      ROAD_HEIGHT,
      previous.position.z + (current.position.z - previous.position.z) * alpha,
    );
    this.group.rotation.y = previous.heading + (current.heading - previous.heading) * alpha;
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
  }
}
