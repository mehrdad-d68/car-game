import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { InputSource, TrackSource } from './ports';
import { CameraRig } from './render/camera-rig';
import { CarView } from './render/car-view';
import { createScene, SceneLights } from './render/scene';
import { disposeLabelCache } from './render/text-label';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { TrackData } from './sim/track';
import { CarState } from './sim/types';
import { createCarState, stepVehicle } from './sim/vehicle';

const LIGHT_OFFSET = new THREE.Vector3(50, 80, 30);

export class Engine {
  private readonly scene: THREE.Scene;
  private readonly lights: SceneLights;
  private readonly trackView: TrackView;
  private readonly carView = new CarView();
  private readonly rig = new CameraRig(1);
  private readonly viewport: Viewport;
  private readonly loop: FixedStepLoop;
  private readonly clock = new THREE.Clock();

  private car: CarState;
  private previousCar: CarState;

  private constructor(
    container: HTMLElement,
    input: InputSource,
    track: TrackData,
  ) {
    const built = createScene();
    this.scene = built.scene;
    this.lights = built.lights;

    this.car = createCarState(track.spawn);
    this.previousCar = this.car;

    this.trackView = new TrackView(track);
    this.trackView.buildLabels();
    this.scene.add(this.trackView.group, this.carView.group);

    this.viewport = new Viewport(container, (aspect) =>
      this.rig.setAspect(aspect),
    );

    this.loop = new FixedStepLoop((dt) => {
      this.previousCar = this.car;
      this.car = stepVehicle(this.car, input.read(), dt);
    });
  }

  static async create(
    container: HTMLElement,
    input: InputSource,
    trackSource: TrackSource,
  ): Promise<Engine> {
    const track = await trackSource.loadTrack();
    return new Engine(container, input, track);
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

  dispose(): void {
    this.carView.dispose();
    this.trackView.dispose();
    this.viewport.dispose();
    disposeLabelCache();
  }
}
