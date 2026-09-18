import * as THREE from 'three';
import { Vec2 } from '../sim/types';

const _raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function groundPoint(
  camera: THREE.Camera,
  ndcX: number,
  ndcY: number,
  groundY: number,
): Vec2 | null {
  camera.updateMatrixWorld();
  _origin.set(ndcX, ndcY, 0.5).unproject(camera);
  _dir.copy(_origin).sub(camera.position).normalize();
  if (_dir.y >= 0) return null;
  const t = (groundY - camera.position.y) / _dir.y;
  if (t <= 0) return null;
  return {
    x: _origin.x + _dir.x * t,
    z: _origin.z + _dir.z * t,
  };
}

export interface HitResult {
  object: THREE.Object3D;
  point: THREE.Vector3;
  instanceId?: number;
  vertex?: number;
}

export function firstHit(
  camera: THREE.Camera,
  ndcX: number,
  ndcY: number,
  objects: THREE.Object3D[],
): HitResult | null {
  camera.updateMatrixWorld();
  _raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const intersections = _raycaster.intersectObjects(objects, true);
  if (intersections.length === 0) return null;
  const hit = intersections[0];
  return {
    object: hit.object,
    point: hit.point,
    instanceId: hit.instanceId,
    vertex: hit.face ? hit.face.a : undefined,
  };
}