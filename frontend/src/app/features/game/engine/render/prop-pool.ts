import * as THREE from 'three';

export interface PartInstance {
  matrix: THREE.Matrix4;
}

export class PropPool {
  readonly mesh: THREE.InstancedMesh;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
  }

  write(instances: PartInstance[]): void {
    const capacity = this.mesh.instanceMatrix.count;
    if (instances.length > capacity) {
      throw new RangeError(
        `PropPool overflow: ${instances.length} instances exceed capacity ${capacity}`,
      );
    }
    for (let i = 0; i < instances.length; i++) {
      this.mesh.setMatrixAt(i, instances[i].matrix);
    }
    this.mesh.count = instances.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
  }

  dispose(): void {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}