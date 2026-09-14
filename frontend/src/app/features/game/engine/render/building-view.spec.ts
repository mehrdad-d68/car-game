import * as THREE from 'three';
import { BuildingGrid } from '../sim/buildings';
import { createTrack } from '../sim/track';
import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import { BUILD_RADIUS, BuildingView, DROP_RADIUS } from './building-view';
import { createBuildingTextures } from './building-textures';
import * as detailKit from './detail-kit';

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
      const parts = detailKit.planParts(building);
      planned += parts.length;
      return parts;
    });

    const updateAndCheck = (x: number, z: number) => {
      const priorTiles = new Set(view.builtTiles);
      const before = planned;
      view.update(x, z);
      const newlyBuilt = grid
        .tilesWithin(x, z, BUILD_RADIUS)
        .filter((k) => !priorTiles.has(k));
      const expectedDelta = newlyBuilt.reduce(
        (sum, k) => sum + grid.buildingsIn(k).reduce((n, b) => n + detailKit.planParts(b).length, 0),
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
});