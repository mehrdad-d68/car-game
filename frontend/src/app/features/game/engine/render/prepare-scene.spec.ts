import * as THREE from 'three';
import { collectHiddenObjects, compileMaterials } from './prepare-scene';

function mesh(visible: boolean): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
  );
  m.visible = visible;
  return m;
}

describe('collectHiddenObjects', () => {
  it('finds hidden meshes anywhere under the root', () => {
    const top = new THREE.Group();
    const visibleMesh = mesh(true);
    const hiddenMesh = mesh(false);
    const nested = new THREE.Group();
    nested.add(hiddenMesh);
    top.add(visibleMesh, nested);

    expect(collectHiddenObjects(top)).toEqual([hiddenMesh]);
  });

  it('finds a hidden group and the hidden objects inside it', () => {
    const top = new THREE.Group();
    const hiddenGroup = new THREE.Group();
    hiddenGroup.visible = false;
    const nestedMesh = mesh(false);
    hiddenGroup.add(nestedMesh);
    top.add(hiddenGroup);

    expect(collectHiddenObjects(top)).toEqual([hiddenGroup, nestedMesh]);
  });

  it('returns an empty list when everything is visible', () => {
    const top = new THREE.Group();
    top.add(mesh(true), mesh(true));
    expect(collectHiddenObjects(top)).toEqual([]);
  });
});

describe('compileMaterials', () => {
  it('makes hidden meshes visible while compiling, then restores them', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const hiddenMesh = mesh(false);
    scene.add(hiddenMesh);

    let compiledVisible = false;
    const renderer = {
      async compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> {
        expect(s).toBe(scene);
        expect(c).toBe(camera);
        compiledVisible = hiddenMesh.visible;
      },
    };

    await compileMaterials(renderer, scene, camera);

    expect(compiledVisible).toBe(true);
    expect(hiddenMesh.visible).toBe(false);
  });

  it('reaches a mesh inside a hidden group, as prop models are placed', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const holder = new THREE.Group();
    holder.visible = false;
    const model = mesh(true);
    holder.add(model);
    scene.add(holder);

    const reached: THREE.Object3D[] = [];
    const renderer = {
      async compileAsync(s: THREE.Scene): Promise<void> {
        s.traverseVisible((object) => reached.push(object));
      },
    };

    await compileMaterials(renderer, scene, camera);

    expect(reached).toContain(model);
    expect(holder.visible).toBe(false);
    expect(model.visible).toBe(true);
  });

  it('restores visibility even when compilation throws', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const hiddenMesh = mesh(false);
    scene.add(hiddenMesh);

    const renderer = {
      async compileAsync(): Promise<void> {
        throw new Error('no WebGL');
      },
    };

    await expect(
      compileMaterials(renderer, scene, camera),
    ).rejects.toThrow('no WebGL');
    expect(hiddenMesh.visible).toBe(false);
  });
});
