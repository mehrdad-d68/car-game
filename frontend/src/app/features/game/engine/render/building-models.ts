import * as THREE from 'three';
import { FLOOR_HEIGHT } from '../sim/buildings';
import { BuildingSpec, PartMaterial } from '../sim/building-spec';
import {
  AtlasRegion,
  BuildingTextures,
  FacadeLook,
  ROOF_COLOURWAYS,
  RoofColourway,
  SWATCH_REGIONS,
  styleRoofColourway,
} from './building-textures';
import { WALL_TILE_METRES } from './building-geometry';
import { loadModel } from './model-loader';
import { PartInstance, PropPool } from './prop-pool';

const CATALOG_CAPACITY: Record<string, number> = {
  house: 4096,
  'apartment-block': 1024,
  shop: 1024,
  warehouse: 256,
  shed: 4096,
  garage: 2048,
  cottage: 2048,
  townhouse: 2048,
  villa: 1024,
  'gruenderzeit-block': 512,
  'tower-block': 128,
  'corner-shop': 512,
};
const DEFAULT_CATALOG_CAPACITY = 512;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export const PART_MATERIALS: readonly PartMaterial[] = [
  'wall',
  'glass',
  'roof',
  'trim',
  'door',
  'shopfront',
];

const FULL_REGION: AtlasRegion = { u0: 0, v0: 0, u1: 1, v1: 1 };

function categoryToLook(category: BuildingSpec['category']): FacadeLook {
  switch (category) {
    case 'apartment':
      return 'apartment';
    case 'shop':
      return 'shop';
    case 'works':
      return 'works';
    default:
      return 'home';
  }
}

function materialRegion(_spec: BuildingSpec, material: PartMaterial): AtlasRegion {
  switch (material) {
    case 'glass':
      return SWATCH_REGIONS.glass;
    case 'trim':
      return SWATCH_REGIONS.trim;
    case 'door':
      return SWATCH_REGIONS.door;
    case 'shopfront':
      return SWATCH_REGIONS.shopfront;
    case 'roof':
      return FULL_REGION;
    default:
      throw new Error(`Unknown part material: ${String(material)}`);
  }
}

export interface CatalogPartInstance extends PartInstance {
  buildingId: number;
}

export function catalogInstanceMatrix(
  spec: BuildingSpec,
  partIndex: number,
  x: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleZ: number,
): THREE.Matrix4 {
  const part = spec.parts[partIndex];
  const px = part.position[0] * scaleX;
  const pz = part.position[2] * scaleZ;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x + px * cos + pz * sin, part.position[1], z - px * sin + pz * cos),
    new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw),
    new THREE.Vector3(part.size[0] * scaleX, part.size[1], part.size[2] * scaleZ),
  );
}

export class BuildingModels {
  readonly group = new THREE.Group();

  private readonly poolByKey = new Map<string, PropPool>();
  private readonly poolByMesh = new Map<THREE.Object3D, string>();
  private readonly spansByKey = new Map<
    string,
    Map<string, { start: number; count: number; ids: number[] }>
  >();
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly sharedMaterials: THREE.Material[] = [];

  constructor(specs: BuildingSpec[], textures: BuildingTextures) {
    const atlasMaterial = new THREE.MeshToonMaterial({
      map: textures.atlas,
      gradientMap: textures.ramp,
      vertexColors: true,
    });
    this.sharedMaterials.push(atlasMaterial);
    const facadeMaterials = {} as Record<FacadeLook, THREE.MeshToonMaterial>;
    const facadeLooks: readonly FacadeLook[] = ['home', 'apartment', 'shop', 'works'];
    for (const look of facadeLooks) {
      facadeMaterials[look] = new THREE.MeshToonMaterial({
        map: textures.facades[look],
        gradientMap: textures.ramp,
        vertexColors: true,
      });
      this.sharedMaterials.push(facadeMaterials[look]);
    }
    const roofMaterials = {} as Record<RoofColourway, THREE.MeshToonMaterial>;
    for (const colourway of ROOF_COLOURWAYS) {
      roofMaterials[colourway] = new THREE.MeshToonMaterial({
        map: textures.roofs[colourway],
        gradientMap: textures.ramp,
        vertexColors: true,
      });
      this.sharedMaterials.push(roofMaterials[colourway]);
    }

    for (const spec of specs) {
      spec.parts.forEach((part, index) => {
        const key = this.partKey(spec.id, index);
        let geometry: THREE.BufferGeometry;
        let material: THREE.Material;
        if (part.material === undefined) {
          geometry = this.unitBox.clone();
          material = new THREE.MeshToonMaterial({
            color: part.color,
            gradientMap: textures.ramp,
            ...(part.emissive === undefined ? {} : { emissive: part.emissive }),
          });
        } else if (!(PART_MATERIALS as readonly string[]).includes(part.material)) {
          throw new Error(`Unknown part material: ${part.material}`);
        } else if (part.material === 'roof') {
          geometry = this.bakedBox(FULL_REGION, part.color);
          material = roofMaterials[styleRoofColourway(categoryToLook(spec.category))];
        } else if (part.material === 'wall') {
          const look = categoryToLook(spec.category);
          geometry = this.bakedFacadeBox(part.size, look, part.color);
          material = facadeMaterials[look];
        } else {
          const region = materialRegion(spec, part.material);
          geometry = this.bakedBox(region, part.color);
          material = atlasMaterial;
        }
        const pool = new PropPool(
          geometry,
          material,
          CATALOG_CAPACITY[spec.id] ?? DEFAULT_CATALOG_CAPACITY,
        );
        pool.mesh.name = `catalog-${spec.id}-${part.name}`;
        pool.mesh.userData['inspect'] = { kind: 'part', partKind: 'catalog' };
        pool.mesh.castShadow = part.castShadow !== false;
        pool.mesh.visible = false;
        this.poolByKey.set(key, pool);
        this.poolByMesh.set(pool.mesh, key);
        this.spansByKey.set(key, new Map());
        this.group.add(pool.mesh);
      });
    }
  }

  private bakedBox(region: AtlasRegion, color: number): THREE.BufferGeometry {
    const geometry = this.unitBox.clone();
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const uSpan = region.u1 - region.u0;
    const vSpan = region.v1 - region.v0;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, region.u0 + uv.getX(i) * uSpan, region.v0 + uv.getY(i) * vSpan);
    }
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  private bakedFacadeBox(
    size: [number, number, number],
    look: FacadeLook,
    color: number,
  ): THREE.BufferGeometry {
    const geometry = this.unitBox.clone();
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (const group of geometry.groups) {
      let repeatsU: number;
      let repeatsV: number;
      switch (group.materialIndex) {
        case 0:
        case 1:
          repeatsU = size[2] / WALL_TILE_METRES;
          repeatsV = size[1] / FLOOR_HEIGHT;
          break;
        case 2:
        case 3:
          repeatsU = size[0] / WALL_TILE_METRES;
          repeatsV = size[2] / WALL_TILE_METRES;
          break;
        default:
          repeatsU = size[0] / WALL_TILE_METRES;
          repeatsV = size[1] / FLOOR_HEIGHT;
      }
      for (let i = group.start; i < group.start + group.count; i++) {
        uv.setXY(i, uv.getX(i) * repeatsU, uv.getY(i) * repeatsV);
      }
    }
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  partKey(specId: string, partIndex: number): string {
    return `${specId}:${partIndex}`;
  }

  append(
    tileKey: string,
    specId: string,
    partIndex: number,
    instances: CatalogPartInstance[],
  ): void {
    if (instances.length === 0) return;
    const key = this.partKey(specId, partIndex);
    const pool = this.poolByKey.get(key);
    if (!pool) return;
    const start = pool.append(instances.map((instance) => instance.matrix));
    this.spansByKey.get(key)!.set(tileKey, {
      start,
      count: instances.length,
      ids: instances.map((instance) => instance.buildingId),
    });
    pool.mesh.visible = pool.mesh.count > 0;
  }

  removeTile(tileKey: string): void {
    for (const [key, spans] of this.spansByKey) {
      const span = spans.get(tileKey);
      if (!span) continue;
      const pool = this.poolByKey.get(key)!;
      pool.removeRange(span.start, span.count);
      for (const [other, displaced] of spans) {
        if (other !== tileKey && displaced.start >= span.start + span.count) {
          displaced.start -= span.count;
        }
      }
      spans.delete(tileKey);
      pool.mesh.visible = pool.mesh.count > 0;
    }
  }

  buildingIdAt(mesh: THREE.Object3D | null, instanceId: number): number | null {
    const key = mesh ? this.poolByMesh.get(mesh) : undefined;
    if (!key) return null;
    for (const span of this.spansByKey.get(key)?.values() ?? []) {
      if (instanceId < span.start || instanceId >= span.start + span.count) continue;
      return span.ids[instanceId - span.start] ?? null;
    }
    return null;
  }

  dispose(): void {
    for (const pool of this.poolByKey.values()) {
      this.group.remove(pool.mesh);
      pool.dispose();
    }
    this.poolByKey.clear();
    this.poolByMesh.clear();
    this.spansByKey.clear();
    for (const material of this.sharedMaterials) {
      material.dispose();
    }
    this.sharedMaterials.length = 0;
    this.unitBox.dispose();
  }
}

export async function loadBuildingModels(
  specs: BuildingSpec[],
): Promise<ReadonlyMap<string, THREE.Group>> {
  const groups = new Map<string, THREE.Group>();
  for (const spec of specs) {
    if (!spec.model) continue;
    try {
      groups.set(
        spec.id,
        await loadModel(spec.model.url, spec.model.targetWidth, spec.model.yawOffset),
      );
    } catch (error) {
      console.warn(`Failed to load building model ${spec.model.url}; skipping`, error);
    }
  }
  return groups;
}