import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { CarSource, InputSource, PropSource, TrackSource } from './ports';
import { CameraRig } from './render/camera-rig';
import { BuildingView } from './render/building-view';
import { createBuildingTextures } from './render/building-textures';
import { CarView } from './render/car-view';
import { FeatureView } from './render/feature-view';
import { clearModelCache, disposeModel, loadCarModel } from './render/model-loader';
import { loadPresentModels, presentPropKinds } from './render/prop-models';
import { compileMaterials } from './render/prepare-scene';
import { RouteArrow } from './render/route-arrow';
import { createScene, SceneLights, SceneSetup } from './render/scene';
import { disposeLabelCache } from './render/text-label';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { CarModel, CarSpec } from './sim/car-spec';
import { Guidance, guide, RouteProgress } from './sim/guidance';
import { MapItemKind } from './sim/osm-types';
import { PropSpec } from './sim/prop-spec';
import { buildRoadGraph, RoadGraph } from './sim/road-graph';
import { planRoute, Route } from './sim/route';
import { TrackData } from './sim/track';
import { CarState } from './sim/types';
import { createCarState, interpolateCarState, stepVehicle } from './sim/vehicle';

const LIGHT_OFFSET = new THREE.Vector3(50, 80, 30);
const DEFAULT_CAR_ID = 'coupe';
const NOTIFY_INTERVAL = 0.25;
const OFF_ROUTE_HOLD = 1.5;
const REPLAN_INTERVAL = 2;
const ARRIVE_HOLD = 2;

export type NavigateResult = 'ok' | 'no-route';

export interface NavigationState {
  street: string;
  remaining: number;
  maneuver: Guidance['maneuver'];
  distanceToManeuver: number;
}

export class Engine {
  private readonly scene: THREE.Scene;
  private readonly lights: SceneLights;
  private readonly sky: THREE.Color | THREE.Texture | null;
  private trackView: TrackView;
  private featureView: FeatureView;
  private buildingView: BuildingView;
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

  private readonly graph: RoadGraph;
  private readonly routeArrow: RouteArrow;
  private route: Route | null = null;
  private routeProgress: RouteProgress = { segmentIndex: 0 };
  private lastGuidance: Guidance | null = null;
  private simSeconds = 0;
  private offRouteSeconds = 0;
  private arriveSeconds = 0;
  private lastReplanSeconds = -Infinity;
  private lastNotifySeconds = -Infinity;
  private readonly navListeners = new Set<(state: NavigationState | null) => void>();

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
    this.graph = buildRoadGraph(track.roads);

    this.carView = new CarView(carSpec.appearance, modelGroup);
    this.trackView = new TrackView(track);
    this.trackView.buildLabels();
    this.featureView = new FeatureView(track, props, propModels);
    this.buildingView = new BuildingView(
      track.buildings,
      createBuildingTextures(() => document.createElement('canvas').getContext('2d')),
    );
    this.buildingView.update(track.spawn.position.x, track.spawn.position.z);
    this.routeArrow = new RouteArrow();
    this.scene.add(
      this.trackView.group,
      this.featureView.group,
      this.buildingView.group,
      this.carView.group,
      this.routeArrow.group,
    );

    this.viewport = new Viewport(container, (aspect) =>
      this.rig.setAspect(aspect),
    );

    this.loop = new FixedStepLoop((dt) => {
      this.simSeconds += dt;
      this.previousCar = this.car;
      this.car = stepVehicle(this.car, input.read(), dt, this.handling);
      this.stepNavigation(dt);
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
    this.buildingView.update(drawn.position.x, drawn.position.z);
    this.routeArrow.update(drawn, this.lastGuidance, frameDelta);

    this.lights.sun.position.set(
      drawn.position.x + LIGHT_OFFSET.x,
      LIGHT_OFFSET.y,
      drawn.position.z + LIGHT_OFFSET.z,
    );
    this.lights.sun.target.position.set(drawn.position.x, 0, drawn.position.z);
    this.lights.sun.target.updateMatrixWorld();

    this.viewport.render(this.scene, this.rig.camera);
  }

  teleportTo(x: number, z: number, heading: number): void {
    this.clearRoute();
    const spawned: CarState = { position: { x, z }, heading, speed: 0 };
    this.car = spawned;
    this.previousCar = spawned;
    this.rig.snap();
  }

  navigateTo(street: string): NavigateResult {
    const route = planRoute(
      this.graph,
      this.track.roads,
      { position: this.car.position, heading: this.car.heading },
      street,
    );
    if (!route) {
      return 'no-route';
    }
    this.route = route;
    this.routeProgress = { segmentIndex: 0 };
    this.lastGuidance = guide(this.route, this.graph, this.car, this.routeProgress);
    this.offRouteSeconds = 0;
    this.arriveSeconds = 0;
    this.lastReplanSeconds = -Infinity;
    this.lastNotifySeconds = this.simSeconds - NOTIFY_INTERVAL;
    this.emitNavigation();
    return 'ok';
  }

  clearRoute(): void {
    if (!this.route) {
      this.lastGuidance = null;
      return;
    }
    this.route = null;
    this.routeProgress = { segmentIndex: 0 };
    this.lastGuidance = null;
    this.offRouteSeconds = 0;
    this.arriveSeconds = 0;
    for (const listener of this.navListeners) {
      listener(null);
    }
  }

  onNavigation(listener: (state: NavigationState | null) => void): void {
    this.navListeners.add(listener);
  }

  private stepNavigation(dt: number): void {
    if (!this.route) {
      this.lastGuidance = null;
      return;
    }

    this.lastGuidance = guide(this.route, this.graph, this.car, this.routeProgress);

    if (this.lastGuidance.offRoute) {
      this.offRouteSeconds += dt;
      if (
        this.offRouteSeconds >= OFF_ROUTE_HOLD &&
        this.simSeconds - this.lastReplanSeconds >= REPLAN_INTERVAL
      ) {
        const replanned = planRoute(
          this.graph,
          this.track.roads,
          { position: this.car.position, heading: this.car.heading },
          this.route.street,
        );
        this.lastReplanSeconds = this.simSeconds;
        if (replanned) {
          this.route = replanned;
          this.routeProgress = { segmentIndex: 0 };
          this.lastGuidance = guide(this.route, this.graph, this.car, this.routeProgress);
          this.offRouteSeconds = 0;
        }
      }
    } else {
      this.offRouteSeconds = 0;
    }

    if (this.lastGuidance.remaining < 1) {
      this.arriveSeconds += dt;
      if (this.arriveSeconds >= ARRIVE_HOLD) {
        this.clearRoute();
        return;
      }
    } else {
      this.arriveSeconds = 0;
    }

    this.notifyNavigation();
  }

  private notifyNavigation(): void {
    const now = this.simSeconds;
    if (now - this.lastNotifySeconds < NOTIFY_INTERVAL) {
      return;
    }
    this.lastNotifySeconds = now;
    this.emitNavigation();
  }

  private emitNavigation(): void {
    if (this.navListeners.size === 0 || !this.route || !this.lastGuidance) {
      return;
    }
    const state: NavigationState = {
      street: this.route.street,
      remaining: this.lastGuidance.remaining,
      maneuver: this.lastGuidance.maneuver,
      distanceToManeuver: this.lastGuidance.distanceToManeuver,
    };
    for (const listener of this.navListeners) {
      listener(state);
    }
  }

  dispose(): void {
    this.clearRoute();
    this.navListeners.clear();
    this.routeArrow.dispose();
    this.carView.dispose();
    this.trackView.dispose();
    this.featureView.dispose();
    this.buildingView.dispose();
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