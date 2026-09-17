import * as THREE from 'three';

export interface PartInstance {
  matrix: THREE.Matrix4;
}

export class PropPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly scratch = new THREE.Matrix4();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
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
    this.mesh.instanceMatrix.needsUpdate = true;
    this.setCount(instances.length);
  }

  append(matrices: readonly THREE.Matrix4[]): number {
    const capacity = this.mesh.instanceMatrix.count;
    const start = this.mesh.count;
    const n = matrices.length;
    if (start + n > capacity) {
      throw new RangeError(
        `PropPool overflow: ${start + n} instances exceed capacity ${capacity}`,
      );
    }
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(start + i, matrices[i]);
    }
    if (n > 0) {
      this.mesh.instanceMatrix.addUpdateRange(start * 16, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.setCount(start + n);
    return start;
  }

  removeRange(start: number, count: number): void {
    const current = this.mesh.count;
    if (count <= 0) return;
    if (start < 0 || start + count > current) {
      throw new RangeError(`PropPool range ${start}:${count} outside [0,${current})`);
    }
    const above = current - (start + count);
    for (let i = 0; i < above; i++) {
      this.mesh.setMatrixAt(start + i, this.mesh.getMatrixAt(start + count + i, this.scratch));
    }
    if (above > 0) {
      this.mesh.instanceMatrix.addUpdateRange(start * 16, above * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.setCount(current - count);
  }

  private setCount(count: number): void {
    this.mesh.count = count;
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
  }

  dispose(): void {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}