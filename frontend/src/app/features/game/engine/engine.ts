import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { CarSource, InputSource, TrackSource } from './ports';
import { CameraRig } from './render/camera-rig';
import { CarView } from './render/car-view';
import { clearModelCache, disposeModel, loadCarModel } from './render/model-loader';
import { createScene, SceneLights } from './render/scene';
import { disposeLabelCache } from './render/text-label';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { CarModel, CarSpec } from './sim/car-spec';
import { TrackData } from './sim/track';
import { CarState } from './sim/types';
import { createCarState, stepVehicle } from './sim/vehicle';

const LIGHT_OFFSET = new THREE.Vector3(50, 80, 30);
const DEFAULT_CAR_ID = 'coupe';

export class Engine {
  private readonly scene: THREE.Scene;
  private readonly lights: SceneLights;
  private readonly trackView: TrackView;
  private carView: CarView;
  private readonly rig = new CameraRig(1);
  private readonly viewport: Viewport;
  private readonly loop: FixedStepLoop;
  private readonly clock = new THREE.Clock();

  private handling: CarSpec['handling'];
  private activeCarSpec: CarSpec;
  private carVersion = 0;

  private car: CarState;
  private previousCar: CarState;

  readonly track: TrackData;
  readonly cars: CarSpec[];

  get activeCar(): CarSpec {
    return this.activeCarSpec;
  }

  private constructor(
    container: HTMLElement,
    input: InputSource,
    track: TrackData,
    cars: CarSpec[],
    carSpec: CarSpec,
    modelGroup?: THREE.Group,
  ) {
    this.track = track;
    this.cars = cars;
    this.handling = carSpec.handling;
    this.activeCarSpec = carSpec;
    const built = createScene();
    this.scene = built.scene;
    this.lights = built.lights;

    this.car = createCarState(track.spawn);
    this.previousCar = this.car;

    this.carView = new CarView(carSpec.appearance, modelGroup);
    this.trackView = new TrackView(track);
    this.trackView.buildLabels();
    this.scene.add(this.trackView.group, this.carView.group);

    this.viewport = new Viewport(container, (aspect) =>
      this.rig.setAspect(aspect),
    );

    this.loop = new FixedStepLoop((dt) => {
      this.previousCar = this.car;
      this.car = stepVehicle(this.car, input.read(), dt, this.handling);
    });
  }

  static async create(
    container: HTMLElement,
    input: InputSource,
    trackSource: TrackSource,
    carSource: CarSource,
    carId: string = DEFAULT_CAR_ID,
  ): Promise<Engine> {
    const [track, cars] = await Promise.all([
      trackSource.loadTrack(),
      carSource.loadCars(),
    ]);
    if (cars.length === 0) {
      throw new Error('CarSource.loadCars() resolved an empty catalog');
    }
    const spec = cars.find((c) => c.id === carId) ?? cars[0];
    const modelGroup = spec.model
      ? await Engine.loadModel(spec.model)
      : undefined;
    return new Engine(container, input, track, cars, spec, modelGroup);
  }

  async setCar(spec: CarSpec): Promise<void> {
    const version = ++this.carVersion;
    const modelGroup = spec.model ? await Engine.loadModel(spec.model) : undefined;
    if (version !== this.carVersion) {
      if (modelGroup) disposeModel(modelGroup);
      return;
    }
    this.scene.remove(this.carView.group);
    this.carView.dispose();
    this.carView = new CarView(spec.appearance, modelGroup);
    this.scene.add(this.carView.group);
    this.handling = spec.handling;
    this.activeCarSpec = spec;
  }

  private static async loadModel(model: CarModel): Promise<THREE.Group | undefined> {
    try {
      return await loadCarModel(model.url, model);
    } catch (error) {
      console.warn(`Failed to load car model ${model.url}; using built-in car`, error);
      return undefined;
    }
  }

  start(): void {
    this.clock.start();
    this.viewport.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const frameDelta = this.clock.getDelta();
    const alpha = this.loop.advance(frameDelta);

    this.carView.sync(this.previousCar, this.car, alpha);
    this.rig.follow(this.car, frameDelta);
    this.trackView.updateLabels(this.car.position.x, this.car.position.z);

    this.lights.sun.position.set(
      this.car.position.x + LIGHT_OFFSET.x,
      LIGHT_OFFSET.y,
      this.car.position.z + LIGHT_OFFSET.z,
    );
    this.lights.sun.target.position.set(this.car.position.x, 0, this.car.position.z);
    this.lights.sun.target.updateMatrixWorld();

    this.viewport.renderer.render(this.scene, this.rig.camera);
  }

  teleportTo(x: number, z: number, heading: number): void {
    const spawned: CarState = { position: { x, z }, heading, speed: 0 };
    this.car = spawned;
    this.previousCar = spawned;
    this.rig.snap();
  }

  dispose(): void {
    this.carView.dispose();
    this.trackView.dispose();
    this.viewport.dispose();
    disposeLabelCache();
    clearModelCache();
  }
}