import * as THREE from 'three';

export function collectHiddenObjects(root: THREE.Object3D): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (!object.visible) hidden.push(object);
  });
  return hidden;
}

export async function compileMaterials(
  renderer: {
    compileAsync(
      scene: THREE.Scene,
      camera: THREE.Camera,
    ): Promise<unknown>;
  },
  scene: THREE.Scene,
  camera: THREE.Camera,
  root: THREE.Object3D = scene,
): Promise<void> {
  const hidden = collectHiddenObjects(root);
  for (const object of hidden) {
    object.visible = true;
  }
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const object of hidden) {
      object.visible = false;
    }
  }
}
