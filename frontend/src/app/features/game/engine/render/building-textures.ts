import * as THREE from 'three';
import type { BuildingStyle } from '../sim/buildings';

export interface AtlasRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const ATLAS_SIZE = 1024;
export const ROOF_SIZE = 1024;
export const FACADE_FLOOR_W = 1024;
export const FACADE_FLOOR_H = 512;

const FACADE_PLINTH_ROWS = 80;
const FACADE_CORNICE_TOP = FACADE_FLOOR_H - 96;

export const SWATCH_REGIONS: Record<'shopfront' | 'door' | 'glass' | 'trim', AtlasRegion> = {
  shopfront: { u0: 0, v0: 0, u1: 0.5, v1: 0.25 },
  door: { u0: 0, v0: 0.25, u1: 0.5, v1: 0.375 },
  glass: { u0: 0, v0: 0.375, u1: 0.5, v1: 0.4375 },
  trim: { u0: 0, v0: 0.4375, u1: 0.5, v1: 0.5 },
};

export type RoofColourway = 'red' | 'slate' | 'metal';
export const ROOF_COLOURWAYS: RoofColourway[] = ['red', 'slate', 'metal'];

export type FacadeLook = 'home' | 'apartment' | 'shop' | 'works';

export function facadeLookFor(style: BuildingStyle): FacadeLook {
  switch (style) {
    case 'apartment':
      return 'apartment';
    case 'shop':
      return 'shop';
    case 'works':
    case 'hut':
      return 'works';
    default:
      return 'home';
  }
}

export function styleRoofColourway(style: BuildingStyle): RoofColourway {
  if (style === 'apartment') return 'slate';
  if (style === 'works' || style === 'hut') return 'metal';
  return 'red';
}

export interface BuildingTextures {
  atlas: THREE.Texture;
  facades: Record<FacadeLook, THREE.Texture>;
  roofs: Record<RoofColourway, THREE.Texture>;
  ramp: THREE.DataTexture;
}

export function createToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    90, 90, 110, 255,
    175, 175, 185, 255,
    255, 255, 255, 255,
  ]);
  const ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

interface WallLook {
  base: string;
  seam: string;
  cornice: string;
  plinth: string;
  door: string;
}

const WALL_LOOKS: Record<FacadeLook, WallLook> = {
  home: { base: '#efe2cf', seam: '#dccbb0', cornice: '#f6f1e6', plinth: '#c9b598', door: '#6b4a34' },
  apartment: { base: '#dddcd3', seam: '#c9c8bf', cornice: '#eceae4', plinth: '#b3b0a6', door: '#4a3626' },
  shop: { base: '#f4dcc2', seam: '#e2bfa0', cornice: '#faf2e6', plinth: '#c9a67f', door: '#3a3428' },
  works: { base: '#d2d6da', seam: '#bcc2c8', cornice: '#e4e7ea', plinth: '#94989e', door: '#5a5f63' },
};

const WINDOW = {
  reveal: '#262b31',
  frame: '#f1ead9',
  glassTop: '#a7c1d2',
  glassBottom: '#4e5b68',
  sill: '#d3cabc',
  mullion: '#e5dcc9',
};

const SHOPFRONT = {
  fascia: '#7a2d24',
  glass: '#a3c3d6',
  mullion: '#7f97a8',
  kick: '#4a3226',
};

export function facadeWindowSlots(style: FacadeLook): number[] {
  switch (style) {
    case 'works':
      return [512];
    default:
      return [256, 768];
  }
}

function paintRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function paintWindow(
  ctx: CanvasRenderingContext2D,
  sheetX: number,
  sheetY: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  const x = sheetX + cx;
  const y = sheetY + cy;
  paintRect(ctx, x - w / 2 - 8, y - h / 2 - 8, w + 16, h + 16, WINDOW.reveal);
  paintRect(ctx, x - w / 2, y - h / 2, w, h, WINDOW.frame);
  paintRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w - 8, (h - 8) / 2, WINDOW.glassTop);
  paintRect(ctx, x - w / 2 + 4, y - h / 2 + 4 + (h - 8) / 2, w - 8, (h - 8) / 2, WINDOW.glassBottom);
  paintRect(ctx, x - 2, y - h / 2 + 4, 4, h - 8, WINDOW.mullion);
  paintRect(ctx, x - w / 2 - 10, y + h / 2 - 2, w + 20, 10, WINDOW.sill);
}

function paintFacadeFloor(
  ctx: CanvasRenderingContext2D,
  style: FacadeLook,
): void {
  const look = WALL_LOOKS[style];
  paintRect(ctx, 0, 0, FACADE_FLOOR_W, FACADE_FLOOR_H, look.base);
  for (let y = 96; y < FACADE_CORNICE_TOP; y += 64) {
    paintRect(ctx, 0, y, FACADE_FLOOR_W, 4, look.seam);
  }

  paintRect(ctx, 0, 0, FACADE_FLOOR_W, FACADE_PLINTH_ROWS, look.plinth);
  for (let i = 1; i < 4; i++) {
    paintRect(ctx, (FACADE_FLOOR_W / 4) * i - 4, 0, 8, FACADE_PLINTH_ROWS, '#00000022');
  }

  paintRect(ctx, 0, FACADE_CORNICE_TOP, FACADE_FLOOR_W, FACADE_FLOOR_H - FACADE_CORNICE_TOP, look.cornice);
  paintRect(ctx, 0, FACADE_CORNICE_TOP + 20, FACADE_FLOOR_W, 4, '#00000026');
  paintRect(ctx, 0, FACADE_CORNICE_TOP + 54, FACADE_FLOOR_W, 6, '#00000026');

  const slots = facadeWindowSlots(style);
  for (const cx of slots) {
    paintWindow(ctx, 0, 0, cx, 248, 216, 232);
  }
}

function paintShopfrontSwatch(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  const k = ATLAS_SIZE / 2048;
  const w = 1024 * k;
  const h = 512 * k;
  paintRect(ctx, x0, y0, w, h, SHOPFRONT.kick);
  const panes = 5;
  const paneW = (w - 60 * k) / panes;
  const paneStep = paneW + 10 * k;
  for (let i = 0; i < panes; i++) {
    paintRect(ctx, x0 + 10 * k + i * paneStep, y0 + 54 * k, paneW, 396 * k, SHOPFRONT.glass);
    paintRect(ctx, x0 + 10 * k + i * paneStep + paneW - 8 * k, y0 + 54 * k, 8 * k, 396 * k, SHOPFRONT.mullion);
  }
  paintRect(ctx, x0, y0 + 60 * k, w, 22 * k, SHOPFRONT.fascia);
}

function paintDoorSwatch(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  const k = ATLAS_SIZE / 2048;
  const door = '#6b4a34';
  paintRect(ctx, x0, y0, 1024 * k, 256 * k, '#24150c');
  paintRect(ctx, x0 + 32 * k, y0 + 36 * k, 960 * k, 184 * k, door);
  paintRect(ctx, x0 + 80 * k, y0 + 60 * k, 390 * k, 136 * k, '#5f4633');
  paintRect(ctx, x0 + 492 * k, y0 + 60 * k, 390 * k, 136 * k, '#5f4633');
}

function paintGlassSwatch(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  const k = ATLAS_SIZE / 2048;
  paintRect(ctx, x0, y0, 1024 * k, 64 * k, WINDOW.glassTop);
  paintRect(ctx, x0, y0 + 64 * k, 1024 * k, 64 * k, WINDOW.glassBottom);
}

function paintTrimSwatch(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  const k = ATLAS_SIZE / 2048;
  paintRect(ctx, x0, y0, 1024 * k, 128 * k, '#ede7d9');
  paintRect(ctx, x0, y0 + 22 * k, 1024 * k, 6 * k, '#d3cabc');
  paintRect(ctx, x0, y0 + 100 * k, 1024 * k, 6 * k, '#d3cabc');
}

function swatchY(v1: number): number {
  return ATLAS_SIZE * (1 - v1);
}

function drawAtlas(ctx: CanvasRenderingContext2D): void {
  paintShopfrontSwatch(ctx, 0, swatchY(0.25));
  paintDoorSwatch(ctx, 0, swatchY(0.375));
  paintGlassSwatch(ctx, 0, swatchY(0.4375));
  paintTrimSwatch(ctx, 0, swatchY(0.5));
}

interface RoofLook {
  light: string;
  dark: string;
  seam: string;
}

const ROOF_LOOKS: Record<RoofColourway, RoofLook> = {
  red: { light: '#b06a48', dark: '#8f4f34', seam: '#6e3321' },
  slate: { light: '#6d7078', dark: '#565a62', seam: '#41444c' },
  metal: { light: '#9aa1aa', dark: '#828a93', seam: '#67707c' },
};

export function paintRoofSheet(ctx: CanvasRenderingContext2D, colourway: RoofColourway): void {
  const look = ROOF_LOOKS[colourway];
  const S = ROOF_SIZE;
  paintRect(ctx, 0, 0, S, S, look.light);
  const rows = 8;
  const tile = S / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      paintRect(
        ctx,
        c * tile + 1,
        r * tile + 1,
        tile - 2,
        tile - 2,
        (c + r) % 2 === 0 ? look.light : look.dark,
      );
    }
  }
  paintRect(ctx, 0, 0, S, 8, look.seam);
  paintRect(ctx, 0, S - 8, S, 8, look.seam);
}

export function createBuildingTextures(
  getContext: (width: number, height: number) => CanvasRenderingContext2D | null,
): BuildingTextures {
  const ctx = getContext(ATLAS_SIZE, ATLAS_SIZE);
  let atlas: THREE.Texture;
  if (ctx) {
    drawAtlas(ctx);
    atlas = new THREE.CanvasTexture(ctx.canvas);
  } else {
    atlas = new THREE.Texture();
  }
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.wrapT = THREE.RepeatWrapping;
  atlas.anisotropy = 4;
  atlas.needsUpdate = true;

  const facades = {} as Record<FacadeLook, THREE.Texture>;
  const rocks: readonly FacadeLook[] = ['home', 'apartment', 'shop', 'works'];
  for (const look of rocks) {
    const facadeCtx = getContext(FACADE_FLOOR_W, FACADE_FLOOR_H);
    let facade: THREE.Texture;
    if (facadeCtx) {
      paintFacadeFloor(facadeCtx, look);
      facade = new THREE.CanvasTexture(facadeCtx.canvas);
    } else {
      facade = new THREE.Texture();
    }
    facade.colorSpace = THREE.SRGBColorSpace;
    facade.wrapS = THREE.RepeatWrapping;
    facade.wrapT = THREE.RepeatWrapping;
    facade.anisotropy = 4;
    facade.needsUpdate = true;
    facades[look] = facade;
  }

  const roofs = {} as Record<RoofColourway, THREE.Texture>;
  for (const colourway of ROOF_COLOURWAYS) {
    const roofCtx = getContext(ROOF_SIZE, ROOF_SIZE);
    let roof: THREE.Texture;
    if (roofCtx) {
      paintRoofSheet(roofCtx, colourway);
      roof = new THREE.CanvasTexture(roofCtx.canvas);
    } else {
      roof = new THREE.Texture();
    }
    roof.colorSpace = THREE.SRGBColorSpace;
    roof.wrapS = THREE.RepeatWrapping;
    roof.wrapT = THREE.RepeatWrapping;
    roof.needsUpdate = true;
    roofs[colourway] = roof;
  }

  return { atlas, facades, roofs, ramp: createToonRamp() };
}