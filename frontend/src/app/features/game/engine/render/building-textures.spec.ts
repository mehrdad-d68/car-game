import * as THREE from 'three';
import { ATLAS_REGION, createBuildingTextures, createToonRamp } from './building-textures';

function stubContext(): CanvasRenderingContext2D {
  return {
    canvas: { width: 1024, height: 1024 },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
  } as unknown as CanvasRenderingContext2D;
}

describe('ATLAS_REGION', () => {
  it('gives each surface its own quarter of the sheet', () => {
    expect(Object.keys(ATLAS_REGION).sort()).toEqual(['apartment', 'home', 'roof', 'shop']);
    for (const region of Object.values(ATLAS_REGION)) {
      expect(region.u1 - region.u0).toBeCloseTo(0.5, 6);
      expect(region.v1 - region.v0).toBeCloseTo(0.5, 6);
    }
    const corners = new Set(Object.values(ATLAS_REGION).map((r) => `${r.u0},${r.v0}`));
    expect(corners.size).toBe(4);
  });
});

describe('createToonRamp', () => {
  it('is a three step ramp, dark to light', () => {
    const ramp = createToonRamp();
    expect(ramp.image.width).toBe(3);
    expect(ramp.image.height).toBe(1);
    const data = ramp.image.data as Uint8Array;
    expect(data[0]).toBeLessThan(data[4]);
    expect(data[4]).toBeLessThan(data[8]);
    expect(ramp.minFilter).toBe(THREE.NearestFilter);
    expect(ramp.magFilter).toBe(THREE.NearestFilter);
  });
});

describe('createBuildingTextures', () => {
  it('marks the atlas as colour data and lets it tile', () => {
    const textures = createBuildingTextures(() => stubContext());
    expect(textures.atlas.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.atlas.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.atlas.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('survives a browser that hands back no context', () => {
    const textures = createBuildingTextures(() => null);
    expect(textures.atlas).toBeDefined();
    expect(textures.ramp).toBeDefined();
  });
});