import * as THREE from 'three';
import { Building, BuildingGrid, BuildingStyle } from '../sim/buildings';
import { ATLAS_REGION } from './building-textures';
import { BuildingTextures } from './building-textures';
import { appendBuilding, emptyMeshArrays } from './building-geometry';
import { PART_KINDS, PartKind, planParts, PartPlacement } from './detail-kit';
import { PartInstance, PropPool } from './prop-pool';

export const BUILD_RADIUS = 750;
export const DROP_RADIUS = 1000;
const PART_CAPACITY: Record<PartKind, number> = {
  gableRoof: 6000,
  flatRoof: 6000,
  parapet: 24000,
  sawtooth: 6000,
  chimney: 6000,
  tank: 6000,
  aerial: 6000,
  acBox: 6000,
  awning: 6000,
  sign: 6000,
  window: 185000,
  door: 6000,
};

export const WALL_COLORS: Record<BuildingStyle, number[]> = {
  home: [0xf2e4cf, 0xe8d3b4, 0xf0d9c6, 0xdfe6ea],
  apartment: [0xe6d9c2, 0xd8dfe6, 0xefe0d2, 0xcfd8dd],
  shop: [0xf6e2d0, 0xf0cfc3, 0xe7d6e8],
  hut: [0xd8cfc2, 0xc9bfae],
  works: [0xcdd3d8, 0xbfc7cc],
};

const STYLE_TO_REGION: Record<BuildingStyle, keyof typeof ATLAS_REGION> = {
  home: 'home',
  apartment: 'apartment',
  shop: 'shop',
  hut: 'home',
  works: 'apartment',
};

const STYLES: readonly BuildingStyle[] = ['home', 'apartment', 'shop', 'hut', 'works'];

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function geometryFromArrays(arrays: ReturnType<typeof emptyMeshArrays>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colors, 3));
  geometry.setAttribute('buildingId', new THREE.Float32BufferAttribute(arrays.buildingIds, 1));
  geometry.setIndex(arrays.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function placementMatrix(part: PartPlacement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(part.x, part.y, part.z),
    new THREE.Quaternion().setFromAxisAngle(Y_AXIS, part.yaw),
    new THREE.Vector3(part.sx, part.sy, part.sz),
  );
}

export class BuildingView {
  readonly group = new THREE.Group();

  private readonly grid: BuildingGrid;
  private readonly textures: BuildingTextures;
  private readonly materials = new Map<BuildingStyle, THREE.MeshToonMaterial>();
  private readonly pools = new Map<PartKind, PropPool>();
  private readonly tiles = new Map<string, THREE.Mesh[]>();
  private readonly tileParts = new Map<string, Map<PartKind, PartInstance[]>>();
  private readonly poolSpans = new Map<
    PartKind,
    Map<string, { start: number; count: number; ids: number[] }>
  >();
  private readonly plan: (building: Building) => PartPlacement[];

  constructor(
    buildings: Building[],
    textures: BuildingTextures,
    plan: (building: Building) => PartPlacement[] = planParts,
  ) {
    this.plan = plan;
    this.textures = textures;
    this.grid = new BuildingGrid(buildings);

    for (const style of STYLES) {
      const map = this.textures.atlas.clone();
      const region = ATLAS_REGION[STYLE_TO_REGION[style]];
      map.offset.set(region.u0, region.v0);
      map.repeat.set(region.u1 - region.u0, region.v1 - region.v0);
      this.materials.set(
        style,
        new THREE.MeshToonMaterial({
          map,
          gradientMap: this.textures.ramp,
          vertexColors: true,
        }),
      );
    }

    const partGeometry = new THREE.BoxGeometry(1, 1, 1);
    const windowGeometry = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
    const doorGeometry = new THREE.BoxGeometry(1, 1, 1);
    const partMaterial = new THREE.MeshToonMaterial({
      color: 0xf2efe8,
      gradientMap: this.textures.ramp,
    });
    const glassMaterial = new THREE.MeshToonMaterial({
      color: 0x2f3a45,
      gradientMap: this.textures.ramp,
    });
    const doorMaterial = new THREE.MeshToonMaterial({
      color: 0x5a3f2c,
      gradientMap: this.textures.ramp,
    });
    for (const kind of PART_KINDS) {
      const geometry =
        kind === 'window' || kind === 'door'
          ? kind === 'window'
            ? windowGeometry
            : doorGeometry
          : partGeometry;
      const material =
        kind === 'window' ? glassMaterial : kind === 'door' ? doorMaterial : partMaterial;
      const pool = new PropPool(geometry, material, PART_CAPACITY[kind]);
      pool.mesh.name = `parts-${kind}`;
      pool.mesh.userData['inspect'] = { kind: 'part', partKind: kind };
      pool.mesh.visible = false;
      this.pools.set(kind, pool);
      this.group.add(pool.mesh);
      this.poolSpans.set(kind, new Map());
    }
  }

  get builtTiles(): string[] {
    return [...this.tiles.keys()];
  }

  buildingIdAt(kind: PartKind, instanceId: number): number | null {
    const spans = this.poolSpans.get(kind);
    if (!spans) return null;
    for (const span of spans.values()) {
      if (instanceId < span.start || instanceId >= span.start + span.count) continue;
      return span.ids[instanceId - span.start] ?? null;
    }
    return null;
  }

  static buildingIdAtVertex(mesh: THREE.Mesh, vertexIndex: number): number | null {
    const idAttr = mesh.geometry.getAttribute('buildingId');
    if (!idAttr) return null;
    return idAttr.getX(vertexIndex);
  }

  private buildTile(key: string): void {
    const buildings = this.grid.buildingsIn(key);
    const byStyle = new Map<BuildingStyle, Building[]>();
    const partsByKind = new Map<PartKind, PartInstance[]>();
    const partIdsByKind = new Map<PartKind, number[]>();
    for (const building of buildings) {
      const bucket = byStyle.get(building.style);
      if (bucket) {
        bucket.push(building);
      } else {
        byStyle.set(building.style, [building]);
      }
      for (const placement of this.plan(building)) {
        const partBucket = partsByKind.get(placement.kind);
        const instance: PartInstance = { matrix: placementMatrix(placement) };
        if (partBucket) {
          partBucket.push(instance);
        } else {
          partsByKind.set(placement.kind, [instance]);
        }
        const idBucket = partIdsByKind.get(placement.kind);
        if (idBucket) {
          idBucket.push(building.id);
        } else {
          partIdsByKind.set(placement.kind, [building.id]);
        }
      }
    }

    const meshes: THREE.Mesh[] = [];
    for (const [style, list] of byStyle) {
      const arrays = emptyMeshArrays();
      const palette = WALL_COLORS[style];
      for (const building of list) {
        appendBuilding(arrays, building, palette[building.seed % palette.length]);
      }
      const mesh = new THREE.Mesh(geometryFromArrays(arrays), this.materials.get(style));
      mesh.name = `buildings-${style}`;
      mesh.userData['inspect'] = { kind: 'building' };
      mesh.castShadow = true;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    for (const [kind, instances] of partsByKind) {
      const pool = this.pools.get(kind)!;
      const start = pool.append(instances.map((instance) => instance.matrix));
      this.poolSpans.get(kind)!.set(key, {
        start,
        count: instances.length,
        ids: partIdsByKind.get(kind) ?? [],
      });
      pool.mesh.visible = pool.mesh.count > 0;
    }
    this.tiles.set(key, meshes);
    this.tileParts.set(key, partsByKind);
  }

  private dropTile(key: string): void {
    const meshes = this.tiles.get(key);
    if (!meshes) return;
    const partsByKind = this.tileParts.get(key);
    if (partsByKind) {
      for (const kind of partsByKind.keys()) {
        const pool = this.pools.get(kind)!;
        const spans = this.poolSpans.get(kind)!;
        const span = spans.get(key);
        if (!span) continue;
        const removed = span.count;
        pool.removeRange(span.start, removed);
        for (const [other, displaced] of spans) {
          if (other !== key && displaced.start >= span.start + removed) {
            displaced.start -= removed;
          }
        }
        spans.delete(key);
        pool.mesh.visible = pool.mesh.count > 0;
      }
    }
    for (const mesh of meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.tiles.delete(key);
    this.tileParts.delete(key);
  }

  update(carX: number, carZ: number): void {
    for (const key of this.grid.tilesWithin(carX, carZ, BUILD_RADIUS)) {
      if (this.tiles.has(key)) continue;
      const centre = this.grid.tileCentre(key);
      if (Math.hypot(centre.x - carX, centre.z - carZ) > BUILD_RADIUS) continue;
      this.buildTile(key);
    }

    const toDrop: string[] = [];
    for (const key of this.tiles.keys()) {
      const centre = this.grid.tileCentre(key);
      const distance = Math.hypot(centre.x - carX, centre.z - carZ);
      if (distance > DROP_RADIUS) toDrop.push(key);
    }
    for (const key of toDrop) this.dropTile(key);
  }

  dispose(): void {
    for (const meshes of this.tiles.values()) {
      for (const mesh of meshes) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.tiles.clear();
    this.tileParts.clear();
    this.poolSpans.clear();

    for (const material of this.materials.values()) {
      material.dispose();
      if (material.map) material.map.dispose();
    }
    this.materials.clear();

    for (const pool of this.pools.values()) {
      this.group.remove(pool.mesh);
      pool.dispose();
    }
    this.pools.clear();
  }
}