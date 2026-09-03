import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { InputSource } from './ports';
import { CameraRig } from './render/camera-rig';
import { CarView } from './render/car-view';
import { createScene } from './render/scene';
import { TrackView } from './render/track-view';
import { Viewport } from './render/viewport';
import { createTrack } from './sim/track';
import { createCarState, stepVehicle } from './sim/vehicle';

export class Engine {
  private readonly scene = createScene();
  private readonly track = createTrack();
  private readonly trackView: TrackView;
  private readonly carView = new CarView();
  private readonly rig = new CameraRig(1);
  private readonly viewport: Viewport;
  private readonly loop: FixedStepLoop;
  private readonly clock = new THREE.Clock();

  private car = createCarState();
  private previousCar = this.car;

  constructor(container: HTMLElement, input: InputSource) {
    this.trackView = new TrackView(this.track);
    this.scene.add(this.trackView.group, this.carView.group);

    this.viewport = new Viewport(container, (aspect) => this.rig.setAspect(aspect));

    this.loop = new FixedStepLoop((dt) => {
      this.previousCar = this.car;
      this.car = stepVehicle(this.car, input.read(), dt);
    });
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

    this.viewport.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.carView.dispose();
    this.trackView.dispose();
    this.viewport.dispose();
  }
}
