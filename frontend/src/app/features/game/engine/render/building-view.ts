import * as THREE from 'three';
import { Building, BuildingGrid, BuildingStyle } from '../sim/buildings';
import {
  CatalogMatch,
  placementClaims,
  placementIndex,
  resolveAssignments,
  resolveOne,
  tileKeyOf,
} from '../sim/building-catalog';
import { BuildingAssignment, BuildingAssignments, BuildingPlacement, BuildingSpec } from '../sim/building-spec';
import { BuildingTextures, facadeLookFor, styleRoofColourway } from './building-textures';
import { appendRoof, appendWalls, emptyMeshArrays } from './building-geometry';
import { BuildingModels, CatalogPartInstance, catalogInstanceMatrix } from './building-models';
import { PART_KINDS, PartKind, planParts, PartPlacement } from './detail-kit';
import { PartInstance, PropPool } from './prop-pool';

export interface BuildingCatalogInput {
  specs: BuildingSpec[];
  placements: BuildingPlacement[];
  assignments: BuildingAssignments;
}

export const BUILD_RADIUS = 750;
export const DROP_RADIUS = 1000;
export const NEARBY_RADIUS = 15;
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
  balcony: 12000,
  balustrade: 24000,
  balconyDoor: 12000,
  dormer: 6000,
};

const PART_MATERIAL: Record<PartKind, number> = {
  gableRoof: 0x9c5a34,
  flatRoof: 0x9c5a34,
  parapet: 0xcfc7ba,
  sawtooth: 0x9c5a34,
  chimney: 0x8a4a3a,
  tank: 0x8f9296,
  aerial: 0x2e3238,
  acBox: 0x8f9296,
  awning: 0x4a7d99,
  sign: 0x2e6b4f,
  balcony: 0xb9c3cb,
  balustrade: 0xb9c3cb,
  balconyDoor: 0x5a4030,
  dormer: 0x9c5a34,
};

const WALL_FAMILIES: Record<BuildingStyle, { base: number; light: number; dark: number }[]> = {
  home: [
    { base: 0xf0e0c6, light: 0xf7ecd8, dark: 0xe0cba8 },
    { base: 0xdfe4e6, light: 0xeaf0f1, dark: 0xcbd2d5 },
    { base: 0xf0e3ef, light: 0xf8f0f7, dark: 0xddc8da },
  ],
  apartment: [
    { base: 0xe2d2ba, light: 0xecdfc9, dark: 0xd0ba9c },
    { base: 0xcbd6dd, light: 0xdce4e9, dark: 0xb4c2cb },
    { base: 0xe8d9cf, light: 0xf2e6de, dark: 0xd7c2b4 },
  ],
  shop: [
    { base: 0xf3d9bd, light: 0xfae9d2, dark: 0xe5c298 },
    { base: 0xe8d0c4, light: 0xf2e1d8, dark: 0xd4b6a6 },
  ],
  hut: [
    { base: 0xd8cfc2, light: 0xe8e1d6, dark: 0xc4b8a6 },
    { base: 0xc9beae, light: 0xddd4c6, dark: 0xb2a48f },
  ],
  works: [
    { base: 0xcdd3d8, light: 0xdfe4e8, dark: 0xb6bec4 },
    { base: 0xbfc7cc, light: 0xd2d9dd, dark: 0xa8b0b6 },
  ],
};

export function tintForBuilding(building: Building, tileKey: string): number {
  const families = WALL_FAMILIES[building.style];
  const [cx, cz] = tileKey.split(',').map((part) => Number(part) || 0);
  const block = Math.abs(((cx * 7) ^ (cz * 13)) % families.length);
  const family = families[block % families.length];
  const variant = building.seed % 3;
  const tones = [family.dark, family.base, family.light];
  const tone = tones[variant];
  const jitter = ((building.seed >> 3) % 5) - 2;
  const color = new THREE.Color(tone);
  color.offsetHSL(0, 0, jitter * 0.015);
  return color.getHex();
}

const STYLES: readonly BuildingStyle[] = ['home', 'apartment', 'shop', 'hut', 'works'];

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function geometryFromArrays(arrays: ReturnType<typeof emptyMeshArrays>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colors, 3));
  geometry.setAttribute('buildingId', new THREE.Int32BufferAttribute(arrays.buildingIds, 1));
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
  private readonly byId = new Map<number, Building>();
  private readonly textures: BuildingTextures;
  private readonly wallMaterials = new Map<BuildingStyle, THREE.MeshToonMaterial>();
  private readonly roofMaterials = new Map<BuildingStyle, THREE.MeshToonMaterial>();
  private readonly pools = new Map<PartKind, PropPool>();
  private readonly tiles = new Map<string, THREE.Mesh[]>();
  private readonly tileParts = new Map<string, Map<PartKind, PartInstance[]>>();
  private readonly poolSpans = new Map<
    PartKind,
    Map<string, { start: number; count: number; ids: number[] }>
  >();
  private readonly plan: (building: Building, nearby: Building[]) => PartPlacement[];

  private readonly catalog: BuildingCatalogInput | null;
  private readonly catalogModels = new Map<string, THREE.Group>();
  private readonly catalogSpecs = new Map<string, BuildingSpec>();
  private readonly placementsByTile = new Map<string, BuildingPlacement[]>();
  private matched = new Map<number, CatalogMatch>();
  private readonly claims = new Set<number>();
  private buildingModels: BuildingModels | null = null;
  private readonly tileModels = new Map<string, THREE.Object3D[]>();

  constructor(
    buildings: Building[],
    textures: BuildingTextures,
    plan: (building: Building, nearby: Building[]) => PartPlacement[] = planParts,
    catalog: BuildingCatalogInput | null = null,
  ) {
    this.plan = plan;
    this.textures = textures;
    this.grid = new BuildingGrid(buildings);
    this.byId.clear();
    for (const building of buildings) {
      this.byId.set(building.id, building);
    }
    this.catalog = catalog;

    if (catalog && catalog.specs.length > 0) {
      this.buildingModels = new BuildingModels(catalog.specs, textures);
      this.group.add(this.buildingModels.group);
      for (const spec of catalog.specs) {
        this.catalogSpecs.set(spec.id, spec);
      }
      this.claims = placementClaims(buildings, catalog.placements, this.catalogSpecs);
      this.matched = resolveAssignments(buildings, catalog.assignments, catalog.specs);
      this.placementsByTile.clear();
      for (const [key, placed] of placementIndex(catalog.placements)) {
        this.placementsByTile.set(key, placed);
      }
    }

    for (const style of STYLES) {
      this.wallMaterials.set(
        style,
        new THREE.MeshToonMaterial({
          map: this.textures.facades[facadeLookFor(style)],
          gradientMap: this.textures.ramp,
          vertexColors: true,
        }),
      );
      this.roofMaterials.set(
        style,
        new THREE.MeshToonMaterial({
          map: this.textures.roofs[styleRoofColourway(style)],
          gradientMap: this.textures.ramp,
          vertexColors: true,
        }),
      );
    }

    const partGeometry = new THREE.BoxGeometry(1, 1, 1);
    for (const kind of PART_KINDS) {
      const material = new THREE.MeshToonMaterial({
        color: PART_MATERIAL[kind],
        gradientMap: this.textures.ramp,
      });
      const pool = new PropPool(partGeometry, material, PART_CAPACITY[kind]);
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

  setModels(models: ReadonlyMap<string, THREE.Group>): void {
    this.catalogModels.clear();
    for (const [specId, group] of models) {
      this.catalogModels.set(specId, group);
    }
  }

  buildingIdAt(
    kind: PartKind | 'catalog',
    instanceId: number,
    object: THREE.Object3D | null = null,
  ): number | null {
    if (kind === 'catalog') {
      return this.buildingModels?.buildingIdAt(object, instanceId) ?? null;
    }
    const spans = this.poolSpans.get(kind);
    if (!spans) return null;
    for (const span of spans.values()) {
      if (instanceId < span.start || instanceId >= span.start + span.count) continue;
      return span.ids[instanceId - span.start] ?? null;
    }
    return null;
  }

  private matchFor(building: Building): CatalogMatch | null {
    if (this.claims.has(building.id)) return null;
    return this.matched.get(building.id) ?? null;
  }

  applyAssignment(buildingId: number, entry: BuildingAssignment | undefined): void {
    if (!this.catalog) return;
    const building = this.byId.get(buildingId);
    if (!building) return;
    const match = entry ? resolveOne(building, entry, this.catalogSpecs) : null;
    if (match) {
      this.matched.set(buildingId, match);
    } else {
      this.matched.delete(buildingId);
    }
    const key = tileKeyOf(building.centroid.x, building.centroid.z);
    if (this.tiles.has(key)) {
      this.dropTile(key);
      this.buildTile(key);
    }
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
    const catalogInstances = new Map<string, CatalogPartInstance[]>();
    const tileModels: THREE.Object3D[] = [];
    for (const building of buildings) {
      const matched = this.matchFor(building);
      if (matched) {
        this.collectCatalog(building, matched, catalogInstances);
        const model = matched.spec.model
          ? this.catalogModels.get(matched.spec.id)
          : undefined;
        if (model) {
          const instance = model.clone();
          instance.position.x = matched.fit.x;
          instance.position.z = matched.fit.z;
          instance.rotation.y = matched.fit.yaw;
          this.group.add(instance);
          tileModels.push(instance);
        }
        continue;
      }
      if (this.claims.has(building.id)) continue;
      const bucket = byStyle.get(building.style);
      if (bucket) {
        bucket.push(building);
      } else {
        byStyle.set(building.style, [building]);
      }
      for (const placement of this.plan(building, this.grid.near(building.centroid.x, building.centroid.z, NEARBY_RADIUS))) {
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

    const placed = this.placementsByTile.get(key);
    if (placed) {
      for (const placement of placed) {
        const spec = this.catalogSpecs.get(placement.specId);
        if (!spec) continue;
        this.collectPlacement(spec, placement, catalogInstances);
        const model = spec.model
          ? this.catalogModels.get(spec.id)
          : undefined;
        if (model) {
          const instance = model.clone();
          instance.position.x = placement.x;
          instance.position.z = placement.z;
          instance.rotation.y = placement.yaw;
          this.group.add(instance);
          tileModels.push(instance);
        }
      }
    }

    const meshes: THREE.Mesh[] = [];
    for (const [style, list] of byStyle) {
      const wallArrays = emptyMeshArrays();
      const roofArrays = emptyMeshArrays();
      for (const building of list) {
        const tint = tintForBuilding(building, key);
        appendWalls(wallArrays, building, tint);
        appendRoof(roofArrays, building, tint);
      }
      const wallMesh = new THREE.Mesh(geometryFromArrays(wallArrays), this.wallMaterials.get(style));
      wallMesh.name = `buildings-${style}`;
      wallMesh.userData['inspect'] = { kind: 'building' };
      wallMesh.castShadow = true;
      this.group.add(wallMesh);
      meshes.push(wallMesh);

      const roofMesh = new THREE.Mesh(geometryFromArrays(roofArrays), this.roofMaterials.get(style));
      roofMesh.name = `roofs-${style}`;
      roofMesh.userData['inspect'] = { kind: 'building' };
      roofMesh.castShadow = true;
      this.group.add(roofMesh);
      meshes.push(roofMesh);
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
    if (this.buildingModels) {
      for (const [partKey, instances] of catalogInstances) {
        const separator = partKey.lastIndexOf(':');
        this.buildingModels.append(
          key,
          partKey.slice(0, separator),
          Number(partKey.slice(separator + 1)),
          instances,
        );
      }
    }
    this.tiles.set(key, meshes);
    this.tileParts.set(key, partsByKind);
    if (tileModels.length > 0) {
      this.tileModels.set(key, tileModels);
    }
  }

  private collectCatalog(
    building: Building,
    matched: CatalogMatch,
    catalogInstances: Map<string, CatalogPartInstance[]>,
  ): void {
    if (!this.buildingModels) return;
    const { spec, fit } = matched;
    for (let i = 0; i < spec.parts.length; i++) {
      const partKey = this.buildingModels.partKey(spec.id, i);
      const bucket = catalogInstances.get(partKey);
      const instance: CatalogPartInstance = {
        buildingId: building.id,
        matrix: catalogInstanceMatrix(spec, i, fit.x, fit.z, fit.yaw, fit.scale.x, fit.scale.z),
      };
      if (bucket) {
        bucket.push(instance);
      } else {
        catalogInstances.set(partKey, [instance]);
      }
    }
  }

  private collectPlacement(
    spec: BuildingSpec,
    placement: BuildingPlacement,
    catalogInstances: Map<string, CatalogPartInstance[]>,
  ): void {
    if (!this.buildingModels) return;
    for (let i = 0; i < spec.parts.length; i++) {
      const partKey = this.buildingModels.partKey(spec.id, i);
      const bucket = catalogInstances.get(partKey);
      const instance: CatalogPartInstance = {
        buildingId: -1,
        matrix: catalogInstanceMatrix(spec, i, placement.x, placement.z, placement.yaw, 1, 1),
      };
      if (bucket) {
        bucket.push(instance);
      } else {
        catalogInstances.set(partKey, [instance]);
      }
    }
  }

  private dropTile(key: string): void {
    const meshes = this.tiles.get(key);
    if (meshes) {
      for (const mesh of meshes) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    const tileModels = this.tileModels.get(key);
    if (tileModels) {
      for (const instance of tileModels) {
        this.group.remove(instance);
      }
    }
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
    this.buildingModels?.removeTile(key);
    if (meshes) {
      this.tiles.delete(key);
    }
    this.tileParts.delete(key);
    this.tileModels.delete(key);
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
    for (const tileModels of this.tileModels.values()) {
      for (const instance of tileModels) {
        this.group.remove(instance);
      }
    }
    this.tileModels.clear();
    this.tileParts.clear();
    this.poolSpans.clear();
    this.buildingModels?.dispose();
    this.buildingModels = null;

    for (const material of this.wallMaterials.values()) {
      material.dispose();
    }
    this.wallMaterials.clear();
    for (const material of this.roofMaterials.values()) {
      material.dispose();
    }
    this.roofMaterials.clear();
    this.textures.atlas.dispose();
    this.textures.ramp.dispose();
    for (const facade of Object.values(this.textures.facades)) {
      facade.dispose();
    }
    for (const roof of Object.values(this.textures.roofs)) {
      roof.dispose();
    }

    for (const pool of this.pools.values()) {
      this.group.remove(pool.mesh);
      pool.dispose();
    }
    this.pools.clear();
  }
}