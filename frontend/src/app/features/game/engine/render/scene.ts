import * as THREE from 'three';

const SKY_ZENITH = new THREE.Color(0x7ec8e3);
const SKY_HORIZON = new THREE.Color(0xc9dde8);
const GROUND_BOUNCE = new THREE.Color(0x6b7c52);

const SUN_COLOR = 0xfff4e0;
const SUN_INTENSITY = 1.6;
const HEMISPHERE_SKY_INTENSITY = 0.7;

const FOG_NEAR = 600;
const FOG_FAR = 2500;
const SHADOW_EXTENT = 20;
const SHADOW_MAP_SIZE = 512;

export interface SceneLights {
  sun: THREE.DirectionalLight;
}

export interface SceneSetup {
  scene: THREE.Scene;
  lights: SceneLights;
  sky: THREE.Color | THREE.Texture;
}

function createSkyGradient(): THREE.Color | THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Color(SKY_ZENITH);
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#' + SKY_ZENITH.getHexString());
  gradient.addColorStop(0.6, '#' + SKY_HORIZON.getHexString());
  gradient.addColorStop(1, '#' + SKY_HORIZON.getHexString());

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene(): SceneSetup {
  const scene = new THREE.Scene();

  const sky = createSkyGradient();
  scene.background = sky;
  scene.fog = new THREE.Fog(SKY_HORIZON, FOG_NEAR, FOG_FAR);

  const hemi = new THREE.HemisphereLight(
    SKY_ZENITH,
    GROUND_BOUNCE,
    HEMISPHERE_SKY_INTENSITY,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.camera.left = -SHADOW_EXTENT;
  sun.shadow.camera.right = SHADOW_EXTENT;
  sun.shadow.camera.top = SHADOW_EXTENT;
  sun.shadow.camera.bottom = -SHADOW_EXTENT;
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 140;
  scene.add(sun);

  return { scene, lights: { sun }, sky };
}
