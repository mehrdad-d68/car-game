import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { bindReadDepth, createOutlineComposer } from './outline-pass';

const MAX_PIXEL_RATIO = 1.5;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private readonly observer: ResizeObserver;
  private composer: EffectComposer | null = null;
  private outlinePass: ShaderPass | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onAspectChange: (aspect: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    container.appendChild(this.renderer.domElement);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.composer) {
      this.composer = createOutlineComposer(this.renderer, scene, camera);
      this.outlinePass = this.composer.passes.find(
        (pass) => pass instanceof ShaderPass,
      ) as ShaderPass;
      if (this.outlinePass) {
        this.outlinePass.uniforms['cameraNear'].value = camera.near;
        this.outlinePass.uniforms['cameraFar'].value = camera.far;
      }
      this.applyComposerSize();
    }
    this.updateOutlineUniforms(camera);
    bindReadDepth(this.composer, this.outlinePass);
    this.composer.render();
  }

  private updateOutlineUniforms(camera: THREE.PerspectiveCamera): void {
    if (!this.outlinePass) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.outlinePass.uniforms['resolution'].value.set(size.x, size.y);
    this.outlinePass.uniforms['cameraNear'].value = camera.near;
    this.outlinePass.uniforms['cameraFar'].value = camera.far;
  }

  private applyComposerSize(): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    this.renderer.setSize(width, height);
    this.applyComposerSize();
    if (this.outlinePass) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.outlinePass.uniforms['resolution'].value.set(size.x, size.y);
    }
    this.onAspectChange(width / height);
  }

  dispose(): void {
    this.observer.disconnect();
    this.renderer.setAnimationLoop(null);
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.outlinePass = null;
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
