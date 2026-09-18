import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { CarSource, InputSource, PropSource, TrackSource } from './ports';
import { BuildingView } from './render/building-view';
import { CameraRig } from './render/camera-rig';
import { createBuildingTextures } from './render/building-textures';
import { CarView } from './render/car-view';
import { DebugPins, Pin } from './render/debug-pins';
import type { PartKind } from './render/detail-kit';
import { FeatureView } from './render/feature-view';
import { clearModelCache, disposeModel, loadCarModel } from './render/model-loader';
import { firstHit, groundPoint } from './render/picker';
import { loadPresentModels, presentPropKinds } from './render/prop-models';
import { compileMaterials } from './render/prepare-scene';
import { RouteArrow } from './render/route-arrow';
import { createScene, SceneLights, SceneSetup } from './render/scene';
import { disposeLabelCache } from './render/text-label';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { CarModel, CarSpec } from './sim/car-spec';
import { inspectPoint, formatReport, nearestRoadHeading } from './sim/inspect';
import type { InspectReport, ReportExtras } from './sim/inspect';
import type { StepManeuver } from './sim/route-steps';
import { Guidance, guide, RouteProgress } from './sim/guidance';
import { MapItemKind } from './sim/osm-types';
import { PropSpec } from './sim/prop-spec';
import { advanceNavigation, createNavigationTimers, NavigationTimers } from './sim/navigation';
import { buildRoadGraph, RoadGraph } from './sim/road-graph';
import { planRoute, Route } from './sim/route';
import { TrackData } from './sim/track';
import { CarState } from './sim/types';
import { createCarState, interpolateCarState, stepVehicle } from './sim/vehicle';
import { ROAD_HEIGHT } from './render/constants';

const LIGHT_OFFSET = new THREE.Vector3(50, 80, 30);
const DEFAULT_CAR_ID = 'coupe';
const NOTIFY_INTERVAL = 0.25;
const MAX_PINS = 9;

const FEATURE_LABELS: Record<MapItemKind, string> = {
  trafficLight: 'traffic light',
  pedestrianCrossing: 'crossing',
  busStop: 'bus stop',
  gasStation: 'gas station',
  fireStation: 'fire station',
  hospital: 'hospital',
  policeStation: 'police station',
};

export type NavigateResult = 'ok' | 'no-route';

export interface NavigationNextStep {
  maneuver: StepManeuver;
  street: string;
  distance: number;
}

export interface NavigationState {
  street: string;
  remaining: number;
  maneuver: Guidance['maneuver'];
  distanceToManeuver: number;
  nextStep: NavigationNextStep | null;
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

  private inspectActive = false;
  private lastPinIndex = 0;
  private pinHit: string | null = null;
  private readonly debugPins = new DebugPins();
  private readonly pinRecords = new Map<number, { text: string; x: number; z: number }>();

  private readonly graph: RoadGraph;
  private readonly routeArrow: RouteArrow;
  private route: Route | null = null;
  private routeProgress: RouteProgress = { segmentIndex: 0 };
  private lastGuidance: Guidance | null = null;
  private simSeconds = 0;
  private navTimers: NavigationTimers = createNavigationTimers();
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
      this.debugPins.group,
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
    if (!this.inspectActive) {
      this.rig.follow(drawn, frameDelta);
    }
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

  get inspectMode(): boolean {
    return this.inspectActive;
  }

  setInspectMode(on: boolean): void {
    this.inspectActive = on;
    this.loop.paused = on;
    if (!on) {
      this.pinHit = null;
      this.lastPinIndex = 0;
      this.pinRecords.clear();
      this.debugPins.set([]);
    }
  }

  inspectAt(clientX: number, clientY: number): { report: InspectReport; hit: string | null } | null {
    if (!this.inspectActive) return null;
    if (this.pinRecords.size >= MAX_PINS) return null;

    const rect = this.viewport.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const point = groundPoint(this.rig.camera, ndcX, ndcY, ROAD_HEIGHT);
    if (!point) return null;

    const report = inspectPoint(this.track, this.graph, point.x, point.z);
    const hit = this.describeHit(ndcX, ndcY);
    this.pinHit = hit;

    const pin = this.lastPinIndex + 1;
    this.lastPinIndex = pin;
    this.pinRecords.set(pin, {
      text: formatReport(pin, report, this.buildExtras()),
      x: report.x,
      z: report.z,
    });
    const pins: Pin[] = [];
    for (const [n, record] of this.pinRecords) {
      pins.push({ n, x: record.x, z: record.z });
    }
    this.debugPins.set(pins);

    return { report, hit };
  }

  reportText(pin: number): string | null {
    return this.pinRecords.get(pin)?.text ?? null;
  }

  pinPosition(pin: number): { x: number; z: number } {
    const record = this.pinRecords.get(pin);
    return record ? { x: record.x, z: record.z } : { x: 0, z: 0 };
  }

  clearPins(): void {
    this.lastPinIndex = 0;
    this.pinHit = null;
    this.pinRecords.clear();
    this.debugPins.set([]);
  }

  get pinCount(): number {
    return this.pinRecords.size;
  }

  goTo(x: number, z: number): void {
    this.clearPins();
    this.setInspectMode(false);
    this.teleportTo(x, z, nearestRoadHeading(this.track, x, z));
  }

  private buildExtras(): ReportExtras {
    let route: ReportExtras['route'] = null;
    if (this.route && this.lastGuidance) {
      route = {
        street: this.route.street,
        remaining: this.lastGuidance.remaining,
        next: this.lastGuidance.nextStep
          ? {
              maneuver: this.lastGuidance.nextStep.maneuver,
              street: this.lastGuidance.nextStep.street,
              distance: this.lastGuidance.distanceToStep,
            }
          : null,
      };
    }
    return {
      hit: this.pinHit,
      car: { ...this.car, position: { x: this.car.position.x, z: this.car.position.z } },
      route,
      map: `${this.track.meta.source} generated ${String(this.track.meta.generatedAt)}`,
    };
  }

  private describeHit(ndcX: number, ndcY: number): string | null {
    const hit = firstHit(this.rig.camera, ndcX, ndcY, [
      this.trackView.group,
      this.featureView.group,
      this.buildingView.group,
      this.carView.group,
    ]);
    if (!hit) return null;

    const tag = this.findInspectTag(hit.object);
    if (!tag) return null;

    if (tag.kind === 'building') {
      const mesh = hit.object as THREE.Mesh;
      const vertex = hit.vertex ?? 0;
      const buildingId = BuildingView.buildingIdAtVertex(mesh, vertex);
      const up =
        hit.object instanceof THREE.Mesh &&
        hit.object.geometry.getAttribute('normal') &&
        hit.object.geometry.getAttribute('normal').getY(vertex) > 0.5;
      const surface = up ? 'roof' : 'wall';
      return buildingId === null ? `${surface}` : `building #${buildingId} ${surface}`;
    }

    if (tag.kind === 'part') {
      const buildingId =
        hit.instanceId !== undefined
          ? this.buildingView.buildingIdAt(tag.partKind as PartKind, hit.instanceId)
          : null;
      return buildingId === null ? 'part' : `building #${buildingId} part`;
    }

    if (tag.kind === 'car') return 'car';
    if (tag.kind === 'ground') return 'ground';
    if (tag.kind === 'road') return 'road';
    return FEATURE_LABELS[tag.kind as MapItemKind] ?? `${tag.kind}`;
  }

  private findInspectTag(object: THREE.Object3D): { kind: string; partKind?: string } | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const tag = current.userData['inspect'] as
        | { kind: string; partKind?: string }
        | undefined;
      if (tag) return tag;
      current = current.parent;
    }
    return null;
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
    this.lastGuidance = guide(this.route, this.car, this.routeProgress);
    this.navTimers = createNavigationTimers();
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
    this.navTimers = createNavigationTimers();
    for (const listener of this.navListeners) {
      listener(null);
    }
  }

  onNavigation(listener: (state: NavigationState | null) => void): () => void {
    this.navListeners.add(listener);
    return () => this.navListeners.delete(listener);
  }

  private stepNavigation(dt: number): void {
    if (!this.route) {
      this.lastGuidance = null;
      return;
    }

    this.lastGuidance = guide(this.route, this.car, this.routeProgress);

    const action = advanceNavigation(this.navTimers, this.lastGuidance, dt, this.simSeconds);
    if (action === 'clear') {
      this.clearRoute();
      return;
    }
    if (action === 'replan') {
      const replanned = planRoute(
        this.graph,
        this.track.roads,
        { position: this.car.position, heading: this.car.heading },
        this.route.street,
      );
      if (replanned) {
        this.route = replanned;
        this.routeProgress = { segmentIndex: 0 };
        this.lastGuidance = guide(this.route, this.car, this.routeProgress);
        this.navTimers.offRouteSeconds = 0;
      }
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
    const next = this.lastGuidance.nextStep;
    const state: NavigationState = {
      street: this.route.street,
      remaining: this.lastGuidance.remaining,
      maneuver: this.lastGuidance.maneuver,
      distanceToManeuver: this.lastGuidance.distanceToManeuver,
      nextStep: next
        ? {
            maneuver: next.maneuver,
            street: next.street,
            distance: this.lastGuidance.distanceToStep,
          }
        : null,
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
    this.debugPins.dispose();
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