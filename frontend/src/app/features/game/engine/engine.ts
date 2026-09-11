import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { CarSource, InputSource, PropSource, TrackSource } from './ports';
import { CameraRig } from './render/camera-rig';
import { CarView } from './render/car-view';
import { FeatureView } from './render/feature-view';
import { clearModelCache, disposeModel, loadCarModel } from './render/model-loader';
import { loadPresentModels, presentPropKinds } from './render/prop-models';
import { compileMaterials } from './render/prepare-scene';
import { createScene, SceneLights, SceneSetup } from './render/scene';
import { disposeLabelCache } from './render/text-label';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { CarModel, CarSpec } from './sim/car-spec';
import { MapItemKind } from './sim/osm-types';
import { PropSpec } from './sim/prop-spec';
import { TrackData } from './sim/track';
import { CarState } from './sim/types';
import { createCarState, interpolateCarState, stepVehicle } from './sim/vehicle';

const LIGHT_OFFSET = new THREE.Vector3(50, 80, 30);
const DEFAULT_CAR_ID = 'coupe';

export class Engine {
  private readonly scene: THREE.Scene;
  private readonly lights: SceneLights;
  private readonly sky: THREE.Color | THREE.Texture | null;
  private trackView: TrackView;
  private featureView: FeatureView;
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

  track: TrackData;
  readonly cars: CarSpec[];
  private readonly props: PropSpec[];
  private propModels: ReadonlyMap<MapItemKind, THREE.Group>;

  get activeCar(): CarSpec {
    return this.activeCarSpec;
  }

  private constructor(
    container: HTMLElement,
    input: InputSource,
    track: TrackData,
    cars: CarSpec[],
    carSpec: CarSpec,
    props: PropSpec[],
    propModels: ReadonlyMap<MapItemKind, THREE.Group>,
    modelGroup?: THREE.Group,
  ) {
    this.track = track;
    this.cars = cars;
    this.props = props;
    this.propModels = propModels;
    this.handling = carSpec.handling;
    this.activeCarSpec = carSpec;
    const built: SceneSetup = createScene();
    this.scene = built.scene;
    this.lights = built.lights;
    this.sky = built.sky;

    this.car = createCarState(track.spawn);
    this.previousCar = this.car;

    this.carView = new CarView(carSpec.appearance, modelGroup);
    this.trackView = new TrackView(track);
    this.trackView.buildLabels();
    this.featureView = new FeatureView(track, props, propModels);
    this.scene.add(this.trackView.group, this.featureView.group, this.carView.group);

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
    propSource: PropSource,
    carId: string = DEFAULT_CAR_ID,
  ): Promise<Engine> {
    const [track, cars, props] = await Promise.all([
      trackSource.loadTrack(),
      carSource.loadCars(),
      propSource.loadProps().catch((error: unknown) => {
        console.warn('Failed to load prop catalog; rendering without props', error);
        return [] as PropSpec[];
      }),
    ]);
    if (cars.length === 0) {
      throw new Error('CarSource.loadCars() resolved an empty catalog');
    }
    const spec = cars.find((c) => c.id === carId) ?? cars[0];
    const propModels = await loadPresentModels(props, presentPropKinds(track));
    const modelGroup = spec.model
      ? await Engine.loadModel(spec.model)
      : undefined;
    const engine = new Engine(container, input, track, cars, spec, props, propModels, modelGroup);
    await engine.compileScene();
    return engine;
  }

  private async compileScene(): Promise<void> {
    try {
      await compileMaterials(
        this.viewport.renderer,
        this.scene,
        this.rig.camera,
      );
    } catch (error) {
      console.warn('Shader pre-compilation failed; programs will compile on first use', error);
    }
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
    const drawn = interpolateCarState(this.previousCar, this.car, alpha);

    this.carView.sync(drawn);
    this.rig.follow(drawn, frameDelta);
    this.trackView.updateLabels(drawn.position.x, drawn.position.z);
    this.featureView.update(drawn.position.x, drawn.position.z);

    this.lights.sun.position.set(
      drawn.position.x + LIGHT_OFFSET.x,
      LIGHT_OFFSET.y,
      drawn.position.z + LIGHT_OFFSET.z,
    );
    this.lights.sun.target.position.set(drawn.position.x, 0, drawn.position.z);
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
    this.featureView.dispose();
    this.viewport.dispose();
    for (const group of this.propModels.values()) {
      disposeModel(group);
    }
    if (this.sky instanceof THREE.Texture) {
      this.sky.dispose();
    }
    disposeLabelCache();
    clearModelCache();
  }
}