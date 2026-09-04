import * as THREE from 'three';

const SKY = 0x87ceeb;
const FOG_NEAR = 600;
const FOG_FAR = 2500;
const SHADOW_EXTENT = 20;
const SHADOW_MAP_SIZE = 512;

export interface SceneLights {
  sun: THREE.DirectionalLight;
}

export function createScene(): { scene: THREE.Scene; lights: SceneLights } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
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

  return { scene, lights: { sun } };
}
