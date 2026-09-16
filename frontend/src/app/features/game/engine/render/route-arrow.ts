import * as THREE from 'three';
import { Guidance, Maneuver } from '../sim/guidance';
import { CarState } from '../sim/types';
import { createToonRamp } from './building-textures';
import { ROAD_HEIGHT } from './constants';

const AHEAD_DISTANCE = 8;
const HEIGHT_ABOVE_ROAD = 2;
const THICKNESS = 0.14;
const ARROW_COLOR = 0x35c2ff;
const YAW_GAIN = 6;
const BOB_AMPLITUDE = 0.18;
const BOB_SPEED = 2.4;

export class RouteArrow {
  readonly group = new THREE.Group();

  private readonly ramp = createToonRamp();
  private readonly material: THREE.MeshToonMaterial;
  private readonly views = new Map<Maneuver, THREE.Group>();
  private readonly disposables: { dispose(): void }[] = [];

  private yaw = 0;
  private bobPhase = 0;

  constructor() {
    this.material = this.track(
      new THREE.MeshToonMaterial({
        color: ARROW_COLOR,
        gradientMap: this.ramp,
      }),
    );

    this.views.set('straight', this.buildArrow(0));
    this.views.set('left', this.buildArrow(-Math.PI / 2));
    this.views.set('right', this.buildArrow(Math.PI / 2));
    this.views.set('uturn', this.buildArrow(Math.PI));
    this.views.set('arrive', this.buildArrive());

    for (const [maneuver, view] of this.views) {
      view.name = maneuver;
      view.visible = false;
      this.group.add(view);
    }
    this.group.visible = false;
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  update(car: CarState, guidance: Guidance | null, dt: number): void {
    if (!guidance) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const forwardX = -Math.sin(car.heading);
    const forwardZ = -Math.cos(car.heading);
    const px = car.position.x + forwardX * AHEAD_DISTANCE;
    const pz = car.position.z + forwardZ * AHEAD_DISTANCE;

    this.bobPhase += dt;
    const y =
      ROAD_HEIGHT +
      HEIGHT_ABOVE_ROAD +
      Math.sin(this.bobPhase * BOB_SPEED) * BOB_AMPLITUDE;

    const targetYaw = Math.atan2(guidance.aimX - px, guidance.aimZ - pz);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.yaw += diff * Math.min(1, dt * YAW_GAIN);

    this.group.position.set(px, y, pz);
    this.group.rotation.y = this.yaw;

    for (const [maneuver, view] of this.views) {
      view.visible = maneuver === guidance.maneuver;
    }
  }

  private buildArrow(gripYaw: number): THREE.Group {
    const group = new THREE.Group();

    const shaft = this.track(new THREE.BoxGeometry(0.9, THICKNESS, 2.6));
    const shaftMesh = new THREE.Mesh(shaft, this.material);
    group.add(shaftMesh);

    const head = this.headGeometry(gripYaw);
    const headMesh = new THREE.Mesh(head, this.material);
    if (gripYaw === 0) {
      headMesh.position.set(0, 0, 1.1);
    } else if (gripYaw === Math.PI) {
      headMesh.position.set(0, 0, -0.3);
    } else {
      headMesh.position.set(Math.sign(gripYaw) * 1.0, 0, 1.1);
    }
    group.add(headMesh);

    return group;
  }

  private headGeometry(gripYaw: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-0.9, 0);
    shape.lineTo(0.9, 0);
    shape.lineTo(0, 2.4);
    shape.closePath();
    const geo = this.track(
      new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false }),
    );
    geo.rotateX(Math.PI / 2);
    geo.rotateY(gripYaw);
    return geo;
  }

  private buildArrive(): THREE.Group {
    const group = new THREE.Group();
    const ring = this.track(
      new THREE.TorusGeometry(0.9, THICKNESS / 2, 8, 28),
    );
    ring.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(ring, this.material);
    mesh.position.y = -THICKNESS / 2;
    group.add(mesh);
    return group;
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.ramp.dispose();
  }
}