import * as THREE from 'three';
import { TrackData } from '../sim/track';

const GROUND_HEIGHT = 0;
const ROAD_HEIGHT = 0.01;
const DASH_HEIGHT = 0.02;
const DASH_WIDTH = 0.4;

export class TrackView {
  readonly group = new THREE.Group();

  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly track: TrackData) {
    this.buildGround();
    this.buildRoads();
    this.buildLaneDashes();
  }

  private own<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(this.track.size, this.track.size)),
      this.own(new THREE.MeshStandardMaterial({ color: 0x4caf50 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_HEIGHT;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  private buildRoads(): void {
    const roadMat = this.own(new THREE.MeshStandardMaterial({ color: 0x37474f }));

    for (const road of this.track.roads) {
      const geometry =
        road.axis === 'x'
          ? new THREE.PlaneGeometry(this.track.size, this.track.roadWidth)
          : new THREE.PlaneGeometry(this.track.roadWidth, this.track.size);

      const mesh = new THREE.Mesh(this.own(geometry), roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        road.axis === 'x' ? 0 : road.offset,
        ROAD_HEIGHT,
        road.axis === 'x' ? road.offset : 0,
      );
      mesh.receiveShadow = true;
      mesh.name = 'road';
      this.group.add(mesh);
    }
  }

  private buildLaneDashes(): void {
    const dashMat = this.own(new THREE.MeshStandardMaterial({ color: 0xfff176 }));
    const alongX = this.own(new THREE.PlaneGeometry(this.track.dashLength, DASH_WIDTH));
    const alongZ = this.own(new THREE.PlaneGeometry(DASH_WIDTH, this.track.dashLength));

    for (const dash of this.track.laneDashes) {
      const mesh = new THREE.Mesh(dash.axis === 'x' ? alongX : alongZ, dashMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(dash.x, DASH_HEIGHT, dash.z);
      mesh.name = 'lane-dash';
      this.group.add(mesh);
    }
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
  }
}
