import * as THREE from 'three';
import { CarAppearance } from '../sim/car-spec';
import { CarState } from '../sim/types';
import { CarView } from './car-view';

const AT_REST: CarState = { position: { x: 0, z: 0 }, heading: 0, speed: 0 };

const APPEARANCE: CarAppearance = {
  body: { width: 1.8, height: 0.5, length: 3.6, color: 0xd32f2f, position: [0, 0.35, 0] },
  cabin: { width: 1.4, height: 0.45, length: 1.6, color: 0x90caf9, position: [0, 0.85, -0.2] },
  wheel: {
    radius: 0.32,
    width: 0.25,
    color: 0x212121,
    positions: [
      [-0.95, 0.32, 1.2],
      [0.95, 0.32, 1.2],
      [-0.95, 0.32, -1.2],
      [0.95, 0.32, -1.2],
    ],
  },
  headlight: {
    width: 0.3,
    height: 0.15,
    length: 0.05,
    color: 0xfff9c4,
    emissive: 0xffff99,
    emissiveIntensity: 0.6,
    positions: [
      [-0.5, 0.35, 1.7],
      [0.5, 0.35, 1.7],
    ],
  },
  taillight: {
    width: 0.3,
    height: 0.15,
    length: 0.05,
    color: 0xff5252,
    emissive: 0xff0000,
    emissiveIntensity: 0.4,
    positions: [
      [-0.5, 0.35, -1.7],
      [0.5, 0.35, -1.7],
    ],
  },
};

describe('CarView', () => {
  it('interpolates position between the previous and current simulation states', () => {
    const view = new CarView(APPEARANCE);
    const current: CarState = { ...AT_REST, position: { x: 10, z: 20 } };

    view.sync(AT_REST, current, 0.5);

    expect(view.group.position.x).toBeCloseTo(5);
    expect(view.group.position.z).toBeCloseTo(10);
  });

  it('interpolates heading between the previous and current simulation states', () => {
    const view = new CarView(APPEARANCE);
    const current: CarState = { ...AT_REST, heading: 1 };

    view.sync(AT_REST, current, 0.25);

    expect(view.group.rotation.y).toBeCloseTo(0.25);
  });

  it('places parts from the appearance', () => {
    const view = new CarView(APPEARANCE);

    const bodies = view.group.children.filter((c) => c.visible);
    const hasBody = bodies.some(
      (c) => c.position.y === APPEARANCE.body.position[1],
    );
    const hasTaillightAtRear = bodies.some(
      (c) => c.position.z === APPEARANCE.taillight.positions[0][2],
    );

    expect(hasBody).toBe(true);
    expect(hasTaillightAtRear).toBe(true);
  });

  it('uses a supplied model group instead of building boxes', () => {
    const group = new THREE.Group();
    const view = new CarView(APPEARANCE, group);

    expect(view.group.children).toContain(group);
  });

  it('leaves the scene with exactly the swapped-in car mounted', () => {
    const scene = new THREE.Scene();
    const first = new CarView(APPEARANCE);
    scene.add(first.group);

    scene.remove(first.group);
    first.dispose();
    const second = new CarView(APPEARANCE, new THREE.Group());
    scene.add(second.group);

    expect(scene.children).toContain(second.group);
    expect(scene.children).not.toContain(first.group);
    expect(second.group.children.some((c) => c.visible)).toBe(true);
  });
});
