import * as THREE from 'three';

const MAX_PIXEL_RATIO = 1.5;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;

  private readonly observer: ResizeObserver;

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

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    this.renderer.setSize(width, height);
    this.onAspectChange(width / height);
  }

  dispose(): void {
    this.observer.disconnect();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
