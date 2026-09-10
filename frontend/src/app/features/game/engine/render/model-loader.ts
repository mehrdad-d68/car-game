import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CarModel } from '../sim/car-spec';
import { PropModel } from '../sim/prop-spec';

export interface ModelFit {
  scale: number;
  lift: number;
}

export function fitModel(size: number, minY: number, targetLength: number): ModelFit {
  if (size <= 0) return { scale: 1, lift: 0 };
  const scale = targetLength / size;
  return { scale, lift: -minY * scale || 0 };
}

const modelBinaryCache = new Map<string, Promise<ArrayBuffer>>();

export function clearModelCache(): void {
  modelBinaryCache.clear();
}

function extractBaseUrl(url: string): string {
  const slash = url.lastIndexOf('/');
  return slash >= 0 ? url.slice(0, slash + 1) : '';
}

async function loadBytes(url: string, cache: RequestCache): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache });
  if (!response.ok) {
    throw new Error(`fetch for "${url}" responded with ${response.status}`);
  }
  return response.arrayBuffer();
}

export function fetchModelBinary(url: string): Promise<ArrayBuffer> {
  let pending = modelBinaryCache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        return await loadBytes(url, 'default');
      } catch {
        return await loadBytes(url, 'reload');
      }
    })().catch((error) => {
      modelBinaryCache.delete(url);
      throw error;
    });
    modelBinaryCache.set(url, pending);
  }
  return pending;
}

function disposeMaterial(material: THREE.Material): void {
  const textures = new Set<THREE.Texture>();
  for (const value of Object.values(material)) {
    if ((value as THREE.Texture).isTexture) {
      textures.add(value as THREE.Texture);
    }
  }
  for (const texture of textures) {
    texture.dispose();
  }
  material.dispose();
}

export function disposeModel(group: THREE.Group): void {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const mat of material) disposeMaterial(mat);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

export async function loadModel(
  url: string,
  targetLength: number,
  yawOffset: number,
): Promise<THREE.Group> {
  const data = await fetchModelBinary(url);
  const group = await new Promise<THREE.Group>((resolve, reject) => {
    new GLTFLoader().parse(data, extractBaseUrl(url), (gltf) => {
      resolve(gltf.scene);
    }, reject);
  });

  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const fit = fitModel(
    Math.max(size.x, size.y, size.z),
    bounds.min.y,
    targetLength,
  );

  group.scale.setScalar(fit.scale);
  group.position.y = fit.lift;
  group.rotation.y = yawOffset;

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
    }
  });

  return group;
}

export async function loadCarModel(url: string, model: CarModel): Promise<THREE.Group> {
  return loadModel(url, model.targetLength, model.yawOffset);
}

export function loadPropModel(model: PropModel): Promise<THREE.Group> {
  return loadModel(model.url, model.targetLength, model.yawOffset);
}