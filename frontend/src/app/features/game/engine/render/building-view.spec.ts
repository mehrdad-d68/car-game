import * as THREE from 'three';
import { BuildingGrid, createBuildings } from '../sim/buildings';
import { createTrack } from '../sim/track';
import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import { BUILD_RADIUS, BuildingView, DROP_RADIUS } from './building-view';
import { createBuildingTextures } from './building-textures';
import { appendBuilding, emptyMeshArrays } from './building-geometry';
import { PART_KINDS, planParts, PartKind } from './detail-kit';
import { firstHit } from './picker';
import { PropPool } from './prop-pool';

const textures = () => createBuildingTextures(() => null);

describe('BuildingView', () => {
  const track = createTrack(viennaData as never);

  it('keeps the build radius smaller than the drop radius', () => {
    expect(BUILD_RADIUS).toBeLessThan(DROP_RADIUS);
  });

  it('builds only the tiles near the car', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    expect(view.builtTiles.length).toBeGreaterThan(0);
    expect(view.builtTiles.length).toBeLessThanOrEqual(25);
    view.dispose();
  });

  it('draws a triangle count in the same range as the roads', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    let triangles = 0;
    view.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.getIndex()) {
        triangles += mesh.geometry.getIndex()!.count / 3;
      }
    });
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBeLessThan(250000);
    view.dispose();
  });

  it('reuses tiles when the car barely moves', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const first = view.builtTiles.slice().sort();
    view.update(315, -45);
    expect(view.builtTiles.slice().sort()).toEqual(first);
    view.dispose();
  });

  it('drops tiles once they are far behind', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const before = view.builtTiles.slice();
    view.update(310.8 + 4000, -40.1);
    expect(view.builtTiles.some((tile) => before.includes(tile))).toBe(false);
    view.dispose();
  });

  it('stays inside its instance pools everywhere on the map', () => {
    const view = new BuildingView(track.buildings, textures());
    for (const [x, z] of [[310.8, -40.1], [1405, -379], [-1500, 800], [2500, 1200]]) {
      expect(() => view.update(x, z)).not.toThrow();
    }
    view.dispose();
  });

  it('frees every geometry it made', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const geometries: THREE.BufferGeometry[] = [];
    view.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) geometries.push(mesh.geometry);
    });
    const spies = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    view.dispose();
    expect(view.group.children).toHaveLength(0);
    for (const spy of spies) expect(spy).toHaveBeenCalled();
  });

  it('does no work on a second update from the same place', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const meshCount = view.group.children.length;
    const first = view.group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const geometry = first.geometry;
    view.update(310.8, -40.1);
    const again = view.group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(view.group.children.length).toBe(meshCount);
    expect(again.geometry).toBe(geometry);
  });

  it('plans parts only for buildings in tiles that are actually built', () => {
    const grid = new BuildingGrid(track.buildings);
    let planned = 0;
    const view = new BuildingView(track.buildings, textures(), (building) => {
      const parts = planParts(building);
      planned += parts.length;
      return parts;
    });

    const updateAndCheck = (x: number, z: number) => {
      const priorTiles = new Set(view.builtTiles);
      const before = planned;
      view.update(x, z);
      const newlyBuilt = grid
        .tilesWithin(x, z, BUILD_RADIUS)
        .filter((k) => {
          const centre = grid.tileCentre(k);
          return Math.hypot(centre.x - x, centre.z - z) <= BUILD_RADIUS;
        })
        .filter((k) => !priorTiles.has(k));
      const expectedDelta = newlyBuilt.reduce(
        (sum, k) => sum + grid.buildingsIn(k).reduce((n, b) => n + planParts(b).length, 0),
        0,
      );
      expect(planned - before).toBe(expectedDelta);
    };

    updateAndCheck(310.8, -40.1);
    updateAndCheck(315, -45);
    updateAndCheck(1010.8, -40.1);
    updateAndCheck(-1500, 800);
    expect(planned).toBeGreaterThan(0);
    view.dispose();
  });

  it('writes exactly the planned part instances into the pools', () => {
    const grid = new BuildingGrid(track.buildings);
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const pools = (view as unknown as { pools: Map<PartKind, PropPool> }).pools;
    for (const kind of PART_KINDS) {
      let expected = 0;
      for (const key of view.builtTiles) {
        for (const building of grid.buildingsIn(key)) {
          for (const part of planParts(building)) {
            if (part.kind === kind) expected += 1;
          }
        }
      }
      expect(pools.get(kind)!.mesh.count).toBe(expected);
      expect(pools.get(kind)!.mesh.visible).toBe(expected > 0);
    }
    view.dispose();
  });

  it('keeps pools consistent across build and drop waves', () => {
    const grid = new BuildingGrid(track.buildings);
    const view = new BuildingView(track.buildings, textures());
    const positions: [number, number][] = [
      [310.8, -40.1],
      [1405, -379],
      [2500, 1200],
      [-1500, 800],
    ];
    const seen = new Set<string>();
    for (const [x, z] of positions) {
      view.update(x, z);
      for (const key of view.builtTiles) seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(0);

    const pools = (view as unknown as { pools: Map<PartKind, PropPool> }).pools;
    for (const kind of PART_KINDS) {
      let expected = 0;
      for (const key of view.builtTiles) {
        for (const building of grid.buildingsIn(key)) {
          for (const part of planParts(building)) {
            if (part.kind === kind) expected += 1;
          }
        }
      }
      expect(pools.get(kind)!.mesh.count).toBe(expected);
    }
    view.dispose();
  });

  it('empties every pool when all tiles drop', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    view.update(9100, 0);
    expect(view.builtTiles).toHaveLength(0);
    const pools = (view as unknown as { pools: Map<PartKind, PropPool> }).pools;
    for (const kind of PART_KINDS) {
      expect(pools.get(kind)!.mesh.count).toBe(0);
      expect(pools.get(kind)!.mesh.visible).toBe(false);
    }
    view.dispose();
  });

  it('maps every pooled part instance back to its building id', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const pools = (view as unknown as { pools: Map<PartKind, PropPool> }).pools;
    let resolved = 0;
    for (const kind of PART_KINDS) {
      const mesh = pools.get(kind)!.mesh;
      for (let i = 0; i < mesh.count; i++) {
        expect(view.buildingIdAt(kind, i)).not.toBeNull();
        resolved++;
      }
    }
    expect(resolved).toBeGreaterThan(0);
    view.dispose();
  });

  it('tags wall meshes for picking and stores a per-vertex building id', () => {
    const view = new BuildingView(track.buildings, textures());
    view.update(310.8, -40.1);
    const wall = view.group.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && mesh.name.startsWith('buildings-');
    }) as THREE.Mesh;
    expect(wall).toBeDefined();
    expect(wall.userData['inspect']).toEqual({ kind: 'building' });
    const idAttribute = wall.geometry.getAttribute('buildingId');
    expect(idAttribute).toBeDefined();
    expect(idAttribute.count).toBe(
      wall.geometry.getAttribute('position').count,
    );
    view.dispose();
  });

  it('resolves a raycast on the second of two buildings to its own id', () => {
    const buildings = createBuildings([
      {
        id: 101,
        type: 'house',
        name: '',
        points: [
          { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 }, { x: 0, z: 0 },
        ],
      },
      {
        id: 202,
        type: 'house',
        name: '',
        points: [
          { x: 60, z: 0 }, { x: 80, z: 0 }, { x: 80, z: 20 }, { x: 60, z: 20 }, { x: 60, z: 0 },
        ],
      },
    ]);
    const arrays = emptyMeshArrays();
    for (const building of buildings) appendBuilding(arrays, building, 0xf2e4cf);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
    geometry.setAttribute('buildingId', new THREE.Float32BufferAttribute(arrays.buildingIds, 1));
    geometry.setIndex(arrays.indices);
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(70, 50, 10);
    camera.lookAt(70, 0, 10);
    camera.updateMatrixWorld();

    const hit = firstHit(camera, 0, 0, [mesh]);
    expect(hit).not.toBeNull();
    expect(hit!.vertex).toEqual(expect.any(Number));
    expect(BuildingView.buildingIdAtVertex(mesh, hit!.vertex!)).toBe(202);
  });
});
