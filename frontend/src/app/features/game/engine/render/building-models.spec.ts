import * as THREE from 'three';
import { createBuildings } from '../sim/buildings';
import { BuildingSpec } from '../sim/building-spec';
import { BuildingView } from './building-view';
import { createBuildingTextures, SWATCH_REGIONS } from './building-textures';
import { BuildingModels, catalogInstanceMatrix, loadBuildingModels } from './building-models';

const textures = () => createBuildingTextures(() => null);

const HOUSE: BuildingSpec = {
  id: 'house',
  name: 'House',
  category: 'house',
  footprint: { width: 8, depth: 12, tolerance: 2.5 },
  height: 5,
  floors: 1,
  match: { osmTypes: ['house'], weight: 2 },
  parts: [
    { name: 'body', size: [8, 5, 12], position: [0, 2.5, 0], color: 0xf2e4cf },
    { name: 'roof', size: [9, 2, 13], position: [0, 6, 0], color: 0x7a4a2b },
    { name: 'door', size: [1.3, 2.3, 0.3], position: [0, 1.15, 6.1], color: 0x5a3f2c },
  ],
};

const A_MATRIX = () => new THREE.Matrix4().makeTranslation(1, 2, 3);

describe('BuildingModels', () => {
  it('creates one pool per part and reports instance ids', () => {
    const models = new BuildingModels([HOUSE], textures());
    expect(models.group.children).toHaveLength(HOUSE.parts.length);
    expect(
      (models.group.children[0] as THREE.InstancedMesh).instanceMatrix.count,
    ).toBe(4096);
    models.append('a', HOUSE.id, 0, [
      { buildingId: 55, matrix: A_MATRIX() },
      { buildingId: 56, matrix: A_MATRIX() },
    ]);
    models.append('a', HOUSE.id, 1, [{ buildingId: 55, matrix: A_MATRIX() }]);
    expect(models.buildingIdAt(models.group.children[0], 0)).toBe(55);
    expect(models.buildingIdAt(models.group.children[0], 1)).toBe(56);
    models.dispose();
  });

  it('resolves an instance id against the pool that owns the mesh', () => {
    const models = new BuildingModels([HOUSE], textures());
    models.append('a', HOUSE.id, 0, [
      { buildingId: 1, matrix: A_MATRIX() },
      { buildingId: 2, matrix: A_MATRIX() },
    ]);
    models.append('a', HOUSE.id, 1, [{ buildingId: 9, matrix: A_MATRIX() }]);
    expect(models.buildingIdAt(models.group.children[1], 0)).toBe(9);
    expect(models.buildingIdAt(models.group.children[0], 1)).toBe(2);
    models.dispose();
  });

  it('answers null for a mesh it does not own', () => {
    const models = new BuildingModels([HOUSE], textures());
    const stranger = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    models.append('a', HOUSE.id, 0, [{ buildingId: 1, matrix: A_MATRIX() }]);
    expect(models.buildingIdAt(stranger, 0)).toBeNull();
    stranger.dispose();
    stranger.geometry.dispose();
    (stranger.material as THREE.Material).dispose();
    models.dispose();
  });

  it('reindexes remaining spans when a tile is removed', () => {
    const models = new BuildingModels([HOUSE], textures());
    models.append('a', HOUSE.id, 0, [{ buildingId: 1, matrix: A_MATRIX() }]);
    models.append('b', HOUSE.id, 0, [{ buildingId: 2, matrix: A_MATRIX() }]);
    models.removeTile('a');
    expect(models.buildingIdAt(models.group.children[0], 0)).toBe(2);
    expect(models.buildingIdAt(models.group.children[0], 1)).toBeNull();
    models.dispose();
  });

  it('stays empty after a full drop and dispose frees the pools', () => {
    const models = new BuildingModels([HOUSE], textures());
    models.append('a', HOUSE.id, 0, [{ buildingId: 1, matrix: A_MATRIX() }]);
    models.removeTile('a');
    expect(models.buildingIdAt(models.group.children[0], 0)).toBeNull();
    models.dispose();
    expect(models.group.children).toHaveLength(0);
  });
});

describe('BuildingModels materials', () => {
  it('maps wall parts from the repeating facade texture of the category', () => {
    const spec: BuildingSpec = {
      ...HOUSE,
      parts: [{ name: 'body', size: [8, 5, 12], position: [0, 2.5, 0], color: 0xf2e4cf, material: 'wall' }],
    };
    const texturesNow = textures();
    const models = new BuildingModels([spec], texturesNow);
    const mesh = models.group.children[0] as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshToonMaterial;
    expect(material.map).toBe(texturesNow.facades.home);
    expect(mesh.geometry.getAttribute('color')).toBeDefined();
    const uv = mesh.geometry.getAttribute('uv');
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, uv.getX(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    expect(maxU).toBeCloseTo(12 / 8, 6);
    expect(maxV).toBeCloseTo(5 / 3.2, 6);
    models.dispose();
  });

  it('bakes the shopfront, door, glass and trim swatches into their parts', () => {
    const spec: BuildingSpec = {
      ...HOUSE,
      parts: [
        { name: 'a', size: [1, 1, 1], position: [0, 0, 0], color: 0x111111, material: 'shopfront' },
        { name: 'b', size: [1, 1, 1], position: [0, 0, 0], color: 0x111111, material: 'door' },
        { name: 'c', size: [1, 1, 1], position: [0, 0, 0], color: 0x111111, material: 'glass' },
        { name: 'd', size: [1, 1, 1], position: [0, 0, 0], color: 0x111111, material: 'trim' },
      ],
    };
    const models = new BuildingModels([spec], textures());
    const regions = [SWATCH_REGIONS.shopfront, SWATCH_REGIONS.door, SWATCH_REGIONS.glass, SWATCH_REGIONS.trim];
    models.group.children.forEach((child, index) => {
      const uv = (child as THREE.InstancedMesh).geometry.getAttribute('uv');
      const region = regions[index];
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(region.u0 - 1e-6);
        expect(uv.getX(i)).toBeLessThanOrEqual(region.u1 + 1e-6);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(region.v0 - 1e-6);
        expect(uv.getY(i)).toBeLessThanOrEqual(region.v1 + 1e-6);
      }
    });
    models.dispose();
  });

  it('gives roof parts the roof texture of the building category colourway', () => {
    const spec: BuildingSpec = {
      ...HOUSE,
      parts: [{ name: 'roof', size: [9, 2, 13], position: [0, 6, 0], color: 0x7a4a2b, material: 'roof' }],
    };
    const texturesNow = textures();
    const models = new BuildingModels([spec], texturesNow);
    const mesh = models.group.children[0] as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshToonMaterial;
    expect(material.map).toBeDefined();
    expect(material.map).toBe(texturesNow.roofs.red);
    expect(mesh.geometry.getAttribute('color')).toBeDefined();
    models.dispose();
  });

  it('throws when a part names a material that does not exist', () => {
    const spec: BuildingSpec = {
      ...HOUSE,
      parts: [
        { name: 'body', size: [8, 5, 12], position: [0, 2.5, 0], color: 0xf2e4cf, material: 'brick' as never },
      ],
    };
    expect(() => new BuildingModels([spec], textures())).toThrow(/Unknown part material/);
  });

  it('keeps flat parts on a plain colour material with no texture', () => {
    const models = new BuildingModels([HOUSE], textures());
    const mesh = models.group.children[0] as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshToonMaterial;
    expect(material.map).toBeNull();
    expect(material.color.getHex()).toBe(HOUSE.parts[0].color);
    models.dispose();
  });
});

describe('catalogInstanceMatrix', () => {
  it('scales x and z but never height', () => {
    const matrix = catalogInstanceMatrix(HOUSE, 0, 10, 20, 0, 1.1, 0.9);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), scale);
    expect(position.x).toBeCloseTo(10, 6);
    expect(position.z).toBeCloseTo(20, 6);
    expect(scale.x).toBeCloseTo(8 * 1.1, 6);
    expect(scale.y).toBeCloseTo(5, 6);
    expect(scale.z).toBeCloseTo(12 * 0.9, 6);
  });

  it('rotates each part offset by the building yaw', () => {
    const matrix = catalogInstanceMatrix(HOUSE, 2, 100, 200, Math.PI / 2, 1, 1);
    const position = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.x).toBeCloseTo(100 + 6.1, 6);
    expect(position.z).toBeCloseTo(200, 6);
    const turned = catalogInstanceMatrix(HOUSE, 2, 100, 200, Math.PI, 1, 1);
    turned.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.z).toBeCloseTo(200 - 6.1, 6);
  });

  it('scales a part offset before rotating it', () => {
    const matrix = catalogInstanceMatrix(HOUSE, 2, 10, 20, 0, 1.1, 0.9);
    const position = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.x).toBeCloseTo(10, 6);
    expect(position.z).toBeCloseTo(20 + 6.1 * 0.9, 6);
  });
});

describe('loadBuildingModels', () => {
  it('returns an empty map when no spec declares a model', async () => {
    const groups = await loadBuildingModels([HOUSE]);
    expect(groups.size).toBe(0);
  });
});

describe('BuildingView with a building catalog', () => {
  it('routes matching buildings to catalog pools instead of procedural walls', () => {
    const building = createBuildings([
      {
        id: 501,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 },
        ],
      },
    ])[0];

    const view = new BuildingView(
      [building],
      textures(),
      undefined,
      { specs: [HOUSE], placements: [], assignments: { '501': { spec: 'house' } } },
    );
    view.update(building.centroid.x, building.centroid.z);

    const walls = view.group.children.filter(
      (child) =>
        (child as THREE.Mesh).isMesh &&
        (child as THREE.Mesh).name.startsWith('buildings-'),
    );
    expect(walls).toHaveLength(0);

    const catalogMeshes: THREE.InstancedMesh[] = [];
    view.group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (mesh.isMesh && mesh.name.startsWith('catalog-')) {
        catalogMeshes.push(mesh);
      }
    });
    expect(catalogMeshes).toHaveLength(HOUSE.parts.length);
    let instances = 0;
    for (const mesh of catalogMeshes) {
      instances += mesh.count;
    }
    expect(instances).toBe(HOUSE.parts.length);
    const bodyMesh = catalogMeshes.find((mesh) => mesh.name === 'catalog-house-body')!;
    expect(view.buildingIdAt('catalog', 0, bodyMesh)).toBe(501);
    view.dispose();
  });

  it('draws an applied assignment immediately and can revert it', () => {
    const building = createBuildings([
      {
        id: 501,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 },
        ],
      },
    ])[0];

    const view = new BuildingView(
      [building],
      textures(),
      undefined,
      { specs: [HOUSE], placements: [], assignments: {} },
    );
    view.update(building.centroid.x, building.centroid.z);

    const catalogInstances = () => {
      const catalogMeshes: THREE.InstancedMesh[] = [];
      view.group.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        if (mesh.isMesh && mesh.name.startsWith('catalog-')) {
          catalogMeshes.push(mesh);
        }
      });
      return catalogMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    };

    expect(catalogInstances()).toBe(0);
    expect(
      view.group.children.filter(
        (child) =>
          (child as THREE.Mesh).isMesh &&
          ((child as THREE.Mesh).name.startsWith('buildings-') ||
            (child as THREE.Mesh).name.startsWith('roofs-')),
      ),
    ).toHaveLength(2);

    view.applyAssignment(501, { spec: 'house' });
    expect(catalogInstances()).toBe(HOUSE.parts.length);
    expect(
      view.group.children.filter(
        (child) =>
          (child as THREE.Mesh).isMesh &&
          ((child as THREE.Mesh).name.startsWith('buildings-') ||
            (child as THREE.Mesh).name.startsWith('roofs-')),
      ),
    ).toHaveLength(0);

    view.applyAssignment(501, { spec: null });
    expect(catalogInstances()).toBe(0);
    view.dispose();
  });

  it('draws a placed spec as instances in its tile and suppresses the building it claims', () => {
    const building = createBuildings([
      {
        id: 601,
        type: 'house',
        name: '',
        levels: 1,
        points: [
          { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 },
        ],
      },
    ])[0];

    const view = new BuildingView(
      [building],
      textures(),
      undefined,
      {
        specs: [HOUSE],
        placements: [
          { specId: 'house', x: building.centroid.x, z: building.centroid.z, yaw: Math.PI / 2 },
        ],
        assignments: {},
      },
    );
    view.update(building.centroid.x, building.centroid.z);

    const walls = view.group.children.filter(
      (child) =>
        (child as THREE.Mesh).isMesh &&
        (child as THREE.Mesh).name.startsWith('buildings-'),
    );
    expect(walls).toHaveLength(0);

    const catalogMeshes: THREE.InstancedMesh[] = [];
    view.group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (mesh.isMesh && mesh.name.startsWith('catalog-')) {
        catalogMeshes.push(mesh);
      }
    });
    let instances = 0;
    for (const mesh of catalogMeshes) {
      instances += mesh.count;
    }
    expect(instances).toBe(HOUSE.parts.length * 1);
    const bodyMesh = catalogMeshes.find((mesh) => mesh.name === 'catalog-house-body')!;
    expect(view.buildingIdAt('catalog', 0, bodyMesh)).toBe(-1);
    view.dispose();
  });
});