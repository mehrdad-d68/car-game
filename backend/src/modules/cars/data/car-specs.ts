import { CarSpec } from '../car-spec';

function lamp(width: number, height: number, length: number, color: number, emissive: number, emissiveIntensity: number, z: number): CarSpec['appearance']['headlight'] & { positions: [number, number, number][] } {
  return {
    width,
    height,
    length,
    color,
    emissive,
    emissiveIntensity,
    positions: [
      [-0.5, 0.35, z],
      [0.5, 0.35, z],
    ],
  };
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'coupe',
    name: 'Coupe',
    handling: {
      enginePower: 18,
      turnRate: 2.4,
      steeringSpeed: 6,
      rollingResistance: 3.5,
      brakePower: 24,
      drag: 0.7,
      maxReverseSpeed: 8,
    },
    appearance: {
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
      headlight: lamp(0.3, 0.15, 0.05, 0xfff9c4, 0xffff99, 0.6, 1.7),
      taillight: lamp(0.3, 0.15, 0.05, 0xff5252, 0xff0000, 0.4, -1.7),
    },
  },
  {
    id: 'sport',
    name: 'Sport',
    handling: {
      enginePower: 30,
      turnRate: 3.2,
      steeringSpeed: 7,
      rollingResistance: 3.5,
      brakePower: 32,
      drag: 0.55,
      maxReverseSpeed: 8,
    },
    appearance: {
      body: { width: 1.9, height: 0.45, length: 3.8, color: 0x1565c0, position: [0, 0.325, 0] },
      cabin: { width: 1.3, height: 0.4, length: 1.5, color: 0x90caf9, position: [0, 0.825, -0.25] },
      wheel: {
        radius: 0.34,
        width: 0.28,
        color: 0x111111,
        positions: [
          [-0.98, 0.34, 1.25],
          [0.98, 0.34, 1.25],
          [-0.98, 0.34, -1.25],
          [0.98, 0.34, -1.25],
        ],
      },
      headlight: lamp(0.3, 0.15, 0.05, 0xffffff, 0x555555, 0.6, 1.8),
      taillight: lamp(0.3, 0.15, 0.05, 0xff4040, 0xff0000, 0.4, -1.8),
    },
  },
  {
    id: 'truck',
    name: 'Hauler',
    handling: {
      enginePower: 14,
      turnRate: 1.6,
      steeringSpeed: 4,
      rollingResistance: 3.5,
      brakePower: 20,
      drag: 0.9,
      maxReverseSpeed: 6,
    },
    appearance: {
      body: { width: 2.1, height: 0.7, length: 4.2, color: 0x558b2f, position: [0, 0.45, 0] },
      cabin: { width: 1.8, height: 0.5, length: 1.8, color: 0x90caf9, position: [0, 1.0, -0.3] },
      wheel: {
        radius: 0.38,
        width: 0.3,
        color: 0x1a1a1a,
        positions: [
          [-1.05, 0.38, 1.35],
          [1.05, 0.38, 1.35],
          [-1.05, 0.38, -1.35],
          [1.05, 0.38, -1.35],
        ],
      },
      headlight: lamp(0.35, 0.18, 0.06, 0xfff9c4, 0x888800, 0.6, 2.0),
      taillight: lamp(0.35, 0.18, 0.06, 0xff4040, 0xff0000, 0.4, -2.0),
    },
  },
];
