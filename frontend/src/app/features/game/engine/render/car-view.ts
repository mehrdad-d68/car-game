import * as THREE from 'three';
import { CarAppearance, CarLamp } from '../sim/car-spec';
import { CarState } from '../sim/types';
import { createToonRamp } from './building-textures';
import { ROAD_HEIGHT } from './constants';
import { disposeModel } from './model-loader';

export class CarView {
  readonly group = new THREE.Group();

  private readonly disposables: { dispose(): void }[] = [];
  private readonly modelGroup: THREE.Group | null;

  constructor(
    private readonly appearance: CarAppearance,
    modelGroup?: THREE.Group,
  ) {
    this.modelGroup = modelGroup ?? null;
    if (modelGroup) {
      this.group.add(modelGroup);
    } else {
      this.build();
    }
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private addBox(
    part: { width: number; height: number; length: number; color: number; position: [number, number, number] },
    castShadow: boolean,
  ): void {
    const mat = this.track(
      new THREE.MeshToonMaterial({ color: part.color, gradientMap: createToonRamp() }),
    );
    const mesh = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(part.width, part.height, part.length)),
      mat,
    );
    mesh.position.set(part.position[0], part.position[1], part.position[2]);
    mesh.castShadow = castShadow;
    this.group.add(mesh);
  }

  private addLamps(lamp: CarLamp): void {
    const mat = this.track(
      new THREE.MeshToonMaterial({
        color: lamp.color,
        emissive: lamp.emissive,
        emissiveIntensity: lamp.emissiveIntensity,
        gradientMap: createToonRamp(),
      }),
    );
    const geo = this.track(new THREE.BoxGeometry(lamp.width, lamp.height, lamp.length));
    for (const [x, y, z] of lamp.positions) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
    }
  }

  private build(): void {
    this.addBox(this.appearance.body, true);
    this.addBox(this.appearance.cabin, false);

    const wheelGeo = this.track(
      new THREE.CylinderGeometry(
        this.appearance.wheel.radius,
        this.appearance.wheel.radius,
        this.appearance.wheel.width,
        16,
      ),
    );
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = this.track(
      new THREE.MeshToonMaterial({ color: this.appearance.wheel.color, gradientMap: createToonRamp() }),
    );
    for (const [x, y, z] of this.appearance.wheel.positions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(x, y, z);
      this.group.add(wheel);
    }

    this.addLamps(this.appearance.headlight);
    this.addLamps(this.appearance.taillight);
  }

  sync(state: CarState): void {
    this.group.position.set(state.position.x, ROAD_HEIGHT, state.position.z);
    this.group.rotation.y = state.heading;
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    if (this.modelGroup) {
      disposeModel(this.modelGroup);
    }
  }
}