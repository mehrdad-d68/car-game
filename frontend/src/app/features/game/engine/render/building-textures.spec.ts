import * as THREE from 'three';
import type { BuildingStyle } from '../sim/buildings';
import {
  ATLAS_SIZE,
  createBuildingTextures,
  createToonRamp,
  FACADE_FLOOR_H,
  FACADE_FLOOR_W,
  facadeLookFor,
  FacadeLook,
  ROOF_SIZE,
  styleRoofColourway,
  SWATCH_REGIONS,
} from './building-textures';

interface Fill {
  fill: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasRequest {
  width: number;
  height: number;
  calls: Fill[];
}

function recorderFactory(log: CanvasRequest[]) {
  return (width: number, height: number) => {
    const entry: CanvasRequest = { width, height, calls: [] };
    log.push(entry);
    let fillStyle = '';
    const ctx = {
      canvas: { width, height },
      get fillStyleValue(): string {
        return fillStyle;
      },
      set fillStyleValue(value: string) {
        fillStyle = value;
      },
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      fillRect(x: number, y: number, w: number, h: number) {
        entry.calls.push({ fill: fillStyle, x, y, w, h });
      },
    } as unknown as CanvasRenderingContext2D;
    return ctx;
  };
}

const overlaps = (a: { u0: number; v0: number; u1: number; v1: number }, b: { u0: number; v0: number; u1: number; v1: number }) =>
  a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;

const facadeSheets = (log: CanvasRequest[]) =>
  log.filter((request) => request.width === FACADE_FLOOR_W && request.height === FACADE_FLOOR_H);

describe('atlas regions', () => {
  it('gives each swatch its own non-overlapping piece of the sheet', () => {
    const regions = Object.values(SWATCH_REGIONS);
    for (const region of regions) {
      expect(region.u1).toBeGreaterThan(region.u0);
      expect(region.v1).toBeGreaterThan(region.v0);
      expect(region.u0).toBeGreaterThanOrEqual(0);
      expect(region.v0).toBeGreaterThanOrEqual(0);
      expect(region.u1).toBeLessThanOrEqual(1);
      expect(region.v1).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        expect(overlaps(regions[i], regions[j])).toBe(false);
      }
    }
  });

  it('maps every building style onto a facade look and a roof colourway', () => {
    const styles: BuildingStyle[] = ['home', 'apartment', 'shop', 'hut', 'works'];
    for (const style of styles) {
      const look = facadeLookFor(style);
      expect(['home', 'apartment', 'shop', 'works']).toContain(look);
      expect(['red', 'slate', 'metal']).toContain(styleRoofColourway(style));
    }
    expect(facadeLookFor('apartment')).toBe('apartment');
    expect(facadeLookFor('home')).toBe('home');
    expect(facadeLookFor('shop')).toBe('shop');
    expect(facadeLookFor('hut')).toBe('works');
    expect(styleRoofColourway('apartment')).toBe('slate');
    expect(styleRoofColourway('works')).toBe('metal');
    expect(styleRoofColourway('home')).toBe('red');
  });

  it('paints one facade floor per lookup on its own repeating sheet', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const facades = facadeSheets(log);
    expect(facades).toHaveLength(4);
    for (const facade of facades) {
      expect(facade.calls.length).toBeGreaterThan(0);
      expect(facade.calls[0].fill).toBeDefined();
    }
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
  it('marks the atlas, facades and roofs as colour data that tiles', () => {
    const textures = createBuildingTextures(recorderFactory([]));
    expect(textures.atlas.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.atlas.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.atlas.wrapT).toBe(THREE.RepeatWrapping);
    for (const facade of Object.values(textures.facades)) {
      expect(facade.wrapS).toBe(THREE.RepeatWrapping);
      expect(facade.wrapT).toBe(THREE.RepeatWrapping);
      expect(facade.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    for (const roof of Object.values(textures.roofs)) {
      expect(roof.wrapS).toBe(THREE.RepeatWrapping);
      expect(roof.wrapT).toBe(THREE.RepeatWrapping);
      expect(roof.colorSpace).toBe(THREE.SRGBColorSpace);
    }
  });

  it('survives a browser that hands back no context', () => {
    const textures = createBuildingTextures(() => null);
    expect(textures.atlas).toBeDefined();
    const looks: readonly FacadeLook[] = ['home', 'apartment', 'shop', 'works'];
    for (const look of looks) {
      expect(textures.facades[look]).toBeDefined();
    }
    expect(textures.roofs.red).toBeDefined();
    expect(textures.roofs.slate).toBeDefined();
    expect(textures.roofs.metal).toBeDefined();
    expect(textures.ramp).toBeDefined();
  });

  it('draws the same atlas on every run from the same code path', () => {
    const first: CanvasRequest[] = [];
    const second: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(first));
    createBuildingTextures(recorderFactory(second));
    expect(second).toEqual(first);
  });

  it('paints a window row across the home facade band', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const home = facadeSheets(log)[0];
    const reveal = home.calls.find(
      (call) =>
        call.fill === '#262b31' && Math.abs(call.x - 140) < 1 && Math.abs(call.y - 124) < 1,
    );
    expect(reveal).toBeDefined();
    const glassTop = home.calls.find(
      (call) => call.fill === '#a7c1d2' && Math.abs(call.y - 136) < 1,
    );
    expect(glassTop).toBeDefined();
  });

  it('lays out the facade floor with a plinth band at the bottom and a cornice at the top', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const home = facadeSheets(log)[0];
    const plinth = home.calls.find((call) => call.fill !== '#262b31' && call.y === 0);
    expect(plinth).toBeDefined();
    const cornice = home.calls.find((call) => call.y + call.h >= FACADE_FLOOR_H);
    expect(cornice).toBeDefined();
    const windowBand = home.calls.filter(
      (call) => call.fill === '#a7c1d2' || call.fill === '#4e5b68',
    );
    expect(windowBand.length).toBeGreaterThan(0);
  });

  it('gives the works facade a single window slot and homes a double', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const facades = facadeSheets(log);
    const homeGlass = facades[0].calls.filter((call) => call.fill === '#a7c1d2').length;
    const worksGlass = facades[3].calls.filter((call) => call.fill === '#a7c1d2').length;
    expect(homeGlass).toBeGreaterThan(worksGlass);
  });

  it('paints each roof colourway on its own 1024px sheet with a distinct base', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const roofSheets = log.filter(
      (request) => request.width === ROOF_SIZE && request.height === ROOF_SIZE,
    ).slice(-3);
    expect(roofSheets).toHaveLength(3);
    const bases = roofSheets.map((request) => request.calls[0].fill);
    expect(new Set(bases).size).toBe(3);
  });

  it('lays out the shopfront as five distinct side-by-side panes', () => {
    const log: CanvasRequest[] = [];
    createBuildingTextures(recorderFactory(log));
    const atlas = log.find(
      (request) => request.width === ATLAS_SIZE && request.height === ATLAS_SIZE,
    );
    expect(atlas).toBeDefined();
    const panes = (atlas?.calls ?? []).filter((call) => call.fill === '#a3c3d6');
    expect(new Set(panes.map((call) => call.x)).size).toBe(5);
    const xSorted = [...new Set(panes.map((call) => call.x))].sort((a, b) => a - b);
    for (let i = 1; i < xSorted.length; i++) {
      expect(xSorted[i]).toBeGreaterThan(xSorted[i - 1]);
    }
  });

  it('keeps the atlas at 1024px for the swatches', () => {
    expect(ATLAS_SIZE).toBe(1024);
  });
});