import * as THREE from 'three';
import { firstHit, groundPoint } from './picker';

describe('groundPoint', () => {
  it('picks the ground point straight under a nadir camera', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    const point = groundPoint(camera, 0, 0, 0.4);
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(0, 2);
    expect(point!.z).toBeCloseTo(0, 2);
  });

  it('stays on the ground plane for a tilted camera', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.lookAt(2, 0, 0);
    const point = groundPoint(camera, 0, 0, 0.4);
    expect(point).not.toBeNull();
    expect(point!.x).toBeGreaterThan(0.5);
    expect(point!.z).toBeCloseTo(0, 2);
  });

  it('returns null when the ray points above the horizon', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, -10, 0);
    camera.lookAt(0, 0, 0);
    expect(groundPoint(camera, 0, 0, 0.4)).toBeNull();
  });
});

describe('firstHit', () => {
  function setup(): {
    camera: THREE.PerspectiveCamera;
    near: THREE.Mesh;
    far: THREE.Mesh;
  } {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const near = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    const far = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    far.position.set(0, 0, -10);
    near.updateMatrixWorld();
    far.updateMatrixWorld();
    return { camera, near, far };
  }

  it('returns the nearest object on the ray', () => {
    const { camera, near, far } = setup();
    const hit = firstHit(camera, 0, 0, [near, far]);
    expect(hit).not.toBeNull();
    expect(hit!.object).toBe(near);
  });

  it('exposes the triangle vertex for per-vertex attributes', () => {
    const { camera, near } = setup();
    const hit = firstHit(camera, 0, 0, [near]);
    expect(hit!.vertex).toEqual(expect.any(Number));
  });

  it('returns null when nothing is in the way', () => {
    const { camera } = setup();
    const lone = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    lone.position.set(30, 0, 30);
    lone.updateMatrixWorld();
    expect(firstHit(camera, 0, 0, [lone])).toBeNull();
  });

  it('reports the instance id of an instanced mesh hit', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
      2,
    );
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(30, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.updateMatrixWorld();

    const hit = firstHit(camera, 0, 0, [mesh]);
    expect(hit).not.toBeNull();
    expect(hit!.instanceId).toBe(0);
  });
});