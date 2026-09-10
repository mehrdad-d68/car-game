import * as THREE from 'three';
import { PropPool } from './prop-pool';

describe('PropPool', () => {
  it('respects capacity and writes matrices in order', () => {
    const pool = new PropPool(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
      3,
    );

    const a = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const b = new THREE.Matrix4().makeTranslation(4, 5, 6);
    pool.write([{ matrix: a }, { matrix: b }]);

    expect(pool.mesh.count).toBe(2);
    const out = new THREE.Matrix4();
    pool.mesh.getMatrixAt(0, out);
    expect(out.elements).toEqual(a.elements);
    pool.mesh.getMatrixAt(1, out);
    expect(out.elements).toEqual(b.elements);
    pool.dispose();
  });

  it('sets the instance count to the visible total', () => {
    const pool = new PropPool(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
      4,
    );

    pool.write([{ matrix: new THREE.Matrix4() }]);
    expect(pool.mesh.count).toBe(1);

    pool.write([{ matrix: new THREE.Matrix4() }, { matrix: new THREE.Matrix4() }]);
    expect(pool.mesh.count).toBe(2);

    pool.write([]);
    expect(pool.mesh.count).toBe(0);
    pool.dispose();
  });

  it('rejects writes beyond its capacity instead of silently truncating', () => {
    const pool = new PropPool(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
      2,
    );

    expect(() =>
      pool.write([
        { matrix: new THREE.Matrix4() },
        { matrix: new THREE.Matrix4() },
        { matrix: new THREE.Matrix4() },
      ]),
    ).toThrow(RangeError);
    pool.dispose();
  });

  it('releases geometry and material on dispose', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial();
    const pool = new PropPool(geometry, material, 1);

    const geometrySpy = vi.spyOn(geometry, 'dispose');
    const materialSpy = vi.spyOn(material, 'dispose');

    pool.dispose();
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
  });
});