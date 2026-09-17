import * as THREE from 'three';
import { Guidance, Maneuver, MANEUVER_DISTANCE, TURN_SHOW_DISTANCE } from '../sim/guidance';
import { CarState } from '../sim/types';
import { createToonRamp } from './building-textures';
import { ROAD_HEIGHT } from './constants';

const HEIGHT_ABOVE_ROAD = 2;
const THICKNESS = 0.14;
const ARROW_COLOR = 0x35c2ff;
const YAW_GAIN = 10;
const BOB_AMPLITUDE = 0.18;
const BOB_SPEED = 2.4;
const CHEVRON_OFFSET_X = 1.15;
const CHEVRON_OFFSET_Z = 0.55;

export class RouteArrow {
  readonly group = new THREE.Group();

  private readonly ramp = createToonRamp();
  private readonly material: THREE.MeshToonMaterial;
  private readonly views = new Map<Maneuver, THREE.Group>();
  private readonly chevrons = new Map<Maneuver, THREE.Object3D>();
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

    const shaft = this.track(new THREE.BoxGeometry(0.9, THICKNESS, 2.6));
    const head = this.track(this.headGeometry(0));
    const chevronGeo = this.track(this.chevronGeometry());

    this.views.set('straight', this.buildStraight(shaft, head, 0, chevronGeo));
    this.views.set('left', this.buildStraight(shaft, head, CHEVRON_OFFSET_X, chevronGeo));
    this.views.set('right', this.buildStraight(shaft, head, -CHEVRON_OFFSET_X, chevronGeo));
    this.views.set('uturn', this.buildUturn(head));
    this.views.set('arrive', this.buildArrive());

    for (const [maneuver, view] of this.views) {
      view.name = maneuver;
      view.visible = false;
      this.group.add(view);
    }

    this.chevrons.set('straight', this.views.get('straight')!.getObjectByName('chevron')!);
    this.chevrons.set('left', this.views.get('left')!.getObjectByName('chevron')!);
    this.chevrons.set('right', this.views.get('right')!.getObjectByName('chevron')!);
    this.group.visible = false;
  }

  get chevronShown(): boolean {
    for (const chevron of this.chevrons.values()) {
      if (chevron.visible) return true;
    }
    return false;
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

    this.bobPhase += dt;
    const y =
      ROAD_HEIGHT +
      HEIGHT_ABOVE_ROAD +
      Math.sin(this.bobPhase * BOB_SPEED) * BOB_AMPLITUDE;

    let diff = guidance.arrowYaw - this.yaw;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.yaw += diff * Math.min(1, dt * YAW_GAIN);

    this.group.position.set(guidance.arrowX, y, guidance.arrowZ);
    this.group.rotation.y = this.yaw;

    for (const [maneuver, view] of this.views) {
      view.visible = maneuver === guidance.maneuver;
    }

    const chevronOn =
      (guidance.maneuver === 'left' || guidance.maneuver === 'right') &&
      guidance.distanceToManeuver > TURN_SHOW_DISTANCE &&
      guidance.distanceToManeuver <= MANEUVER_DISTANCE;
    for (const [maneuver, chevron] of this.chevrons) {
      chevron.visible = chevronOn && maneuver === guidance.maneuver;
    }
  }

  private buildStraight(
    shaftGeometry: THREE.BufferGeometry,
    headGeometry: THREE.BufferGeometry,
    chevronX: number,
    chevronGeometry: THREE.BufferGeometry,
  ): THREE.Group {
    const group = new THREE.Group();
    const shaftMesh = new THREE.Mesh(shaftGeometry, this.material);
    group.add(shaftMesh);

    const headMesh = new THREE.Mesh(headGeometry, this.material);
    headMesh.position.set(0, 0, 1.1);
    group.add(headMesh);

    const chevron = new THREE.Mesh(chevronGeometry, this.material);
    chevron.name = 'chevron';
    chevron.position.set(chevronX, 0, CHEVRON_OFFSET_Z);
    chevron.scale.x = chevronX < 0 ? -1 : 1;
    group.add(chevron);

    return group;
  }

  private buildUturn(headGeometry: THREE.BufferGeometry): THREE.Group {
    const group = new THREE.Group();

    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-0.9, 0, 1.4),
        new THREE.Vector3(-0.9, 0, 0.8),
        new THREE.Vector3(-0.9, 0, 0),
        new THREE.Vector3(-0.9, 0, -1.0),
        new THREE.Vector3(-0.9, 0, -1.6),
        new THREE.Vector3(0, 0, -2.0),
        new THREE.Vector3(0.9, 0, -1.6),
        new THREE.Vector3(0.9, 0, -1.0),
        new THREE.Vector3(0.9, 0, 0),
        new THREE.Vector3(0.9, 0, 0.8),
        new THREE.Vector3(0.9, 0, 1.4),
      ],
      false,
      'centripetal',
    );
    const tube = this.track(new THREE.TubeGeometry(curve, 64, 0.13, 8, false));
    const tubeMesh = new THREE.Mesh(tube, this.material);
    tubeMesh.name = 'loop';
    group.add(tubeMesh);

    const headMesh = new THREE.Mesh(headGeometry, this.material);
    headMesh.position.set(0.9, 0, 1.42);
    headMesh.scale.set(0.45, 1, 0.45);
    group.add(headMesh);

    return group;
  }

  private headGeometry(gripYaw: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-0.9, 0);
    shape.lineTo(0.9, 0);
    shape.lineTo(0, 2.4);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.rotateY(gripYaw);
    return geo;
  }

  private chevronGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.35);
    shape.lineTo(0, 0.35);
    shape.lineTo(0.6, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  private buildArrive(): THREE.Group {
    const group = new THREE.Group();
    const ring = this.track(new THREE.TorusGeometry(0.9, THICKNESS / 2, 8, 28));
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