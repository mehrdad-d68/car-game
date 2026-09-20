import * as THREE from 'three';
import { ROAD_HEIGHT } from './constants';
import { makeLabelMesh } from './text-label';

const POST_HEIGHT = 1.6;
const LABEL_HEIGHT = 3.2;
const LABEL_SCALE = 0.35;
const POST_COLOR = 0xffe066;

export interface Pin {
  n: number;
  x: number;
  z: number;
}

export type LabelFactory = (text: string) => THREE.Mesh | null;

export function pinLabel(text: string): THREE.Mesh | null {
  return makeLabelMesh(text, 'white');
}

export class DebugPins {
  readonly group = new THREE.Group();

  private readonly disposables: { dispose(): void }[] = [];
  private readonly pins = new Map<number, THREE.Group>();
  private postGeo: THREE.BoxGeometry | null = null;
  private postMat: THREE.MeshBasicMaterial | null = null;

  constructor(private readonly makeLabel: LabelFactory = pinLabel) {}

  set(pins: Pin[]): void {
    const seen = new Set<number>();
    for (const pin of pins) {
      seen.add(pin.n);
      const existing = this.pins.get(pin.n);
      if (existing) {
        existing.position.set(pin.x, ROAD_HEIGHT, pin.z);
        continue;
      }
      const holder = new THREE.Group();
      const post = this.postMesh();
      holder.add(post);
      const label = this.makeLabel(String(pin.n));
      if (label) {
        label.scale.setScalar(LABEL_SCALE);
        label.position.y = LABEL_HEIGHT;
        holder.add(label);
      }
      holder.position.set(pin.x, ROAD_HEIGHT, pin.z);
      this.pins.set(pin.n, holder);
      this.group.add(holder);
    }
    for (const [n, holder] of this.pins) {
      if (seen.has(n)) continue;
      this.group.remove(holder);
      this.pins.delete(n);
    }
  }

  private postMesh(): THREE.Mesh {
    if (!this.postGeo || !this.postMat) {
      this.postGeo = new THREE.BoxGeometry(0.08, POST_HEIGHT, 0.08);
      this.postMat = new THREE.MeshBasicMaterial({ color: POST_COLOR });
      this.disposables.push(this.postGeo, this.postMat);
    }
    const mesh = new THREE.Mesh(this.postGeo, this.postMat);
    mesh.position.y = POST_HEIGHT / 2;
    return mesh;
  }

  dispose(): void {
    this.group.clear();
    this.pins.clear();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.postGeo = null;
    this.postMat = null;
  }
}