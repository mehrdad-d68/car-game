import * as THREE from 'three';
import { DebugPins, Pin } from './debug-pins';
import { ROAD_HEIGHT } from './constants';

function label(text: string): THREE.Mesh | null {
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
}

describe('DebugPins', () => {
  it('adds one holder per pin at the requested position', () => {
    const pins = new DebugPins(label);
    pins.set([
      { n: 1, x: 10, z: 20 },
      { n: 2, x: -5, z: 4 },
    ]);
    expect(pins.group.children).toHaveLength(2);
    const first = pins.group.children.find(
      (c) => c.position.x === 10 && c.position.z === 20,
    );
    expect(first).toBeDefined();
    expect(first!.position.y).toBe(ROAD_HEIGHT);
    pins.dispose();
  });

  it('moves an existing pin instead of duplicating it', () => {
    const pins = new DebugPins(label);
    pins.set([{ n: 1, x: 0, z: 0 }]);
    const before = pins.group.children;
    pins.set([{ n: 1, x: 50, z: -50 }]);
    expect(pins.group.children).toHaveLength(1);
    expect(pins.group.children[0]).toBe(before[0]);
    expect(pins.group.children[0].position.x).toBe(50);
    pins.dispose();
  });

  it('removes pins that are no longer present', () => {
    const pins = new DebugPins(label);
    const batch: Pin[] = [1, 2, 3].map((n) => ({ n, x: n * 10, z: 0 }));
    pins.set(batch);
    pins.set([batch[0]]);
    expect(pins.group.children).toHaveLength(1);
    pins.dispose();
  });

  it('disposes the shared post resources and clears the group', () => {
    const pins = new DebugPins(label);
    pins.set([{ n: 1, x: 0, z: 0 }]);
    pins.dispose();
    expect(pins.group.children).toHaveLength(0);
  });
});