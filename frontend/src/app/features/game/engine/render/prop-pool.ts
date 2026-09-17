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
    // This mesh spans the whole streamed radius around the car, so its bounding sphere
    // almost always intersects the view frustum anyway. Frustum culling it buys nothing,
    // but three.js recomputes that sphere by iterating every active instance whenever it's
    // null (see commit()) — for the window pool that's up to ~150k instances, right inside
    // render(). Skip the check entirely instead of paying for it every time a tile changes.
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
    // A full replace: every instance may have moved, so upload it all.
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
    // Without an explicit range, three.js re-uploads the whole buffer (up to capacity) on
    // every commit, regardless of how little changed. Scope the GPU upload to what moved.
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
    // If the removed range was the tail, nothing shifted and there is nothing to re-upload —
    // only mesh.count needs to shrink, which costs nothing on the GPU side.
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