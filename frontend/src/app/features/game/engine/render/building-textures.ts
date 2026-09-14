import * as THREE from 'three';

export interface AtlasRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const ATLAS_REGION: Record<'home' | 'apartment' | 'shop' | 'roof', AtlasRegion> = {
  home: { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
  apartment: { u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
  shop: { u0: 0, v0: 0, u1: 0.5, v1: 0.5 },
  roof: { u0: 0.5, v0: 0, u1: 1, v1: 0.5 },
};

export const ATLAS_SIZE = 1024;
export const FLOORS_PER_TILE = 4;

export interface BuildingTextures {
  atlas: THREE.Texture;
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

const WALL_LOOKS = {
  home: { base: '#f0e4cd', floor: '#e3d3b8' },
  apartment: { base: '#d9d8d0', floor: '#c9c8bf' },
  shop: { base: '#f3d9c0', floor: '#e6cbb0' },
};

function drawWallQuarter(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  size: number,
  look: (typeof WALL_LOOKS)[keyof typeof WALL_LOOKS],
): void {
  const rowHeight = size / FLOORS_PER_TILE;
  ctx.fillStyle = look.base;
  ctx.fillRect(x0, y0, size, size);

  for (let row = 0; row < FLOORS_PER_TILE; row++) {
    const ry = y0 + row * rowHeight;
    ctx.fillStyle = look.floor;
    ctx.fillRect(x0, ry, size, rowHeight);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 1, y0 + 1, size - 2, size - 2);
}

function drawRoofQuarter(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  size: number,
): void {
  ctx.fillStyle = '#858b95';
  ctx.fillRect(x0, y0, size, size);
  const rows = 8;
  const rowHeight = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0 ? 8 : 7;
    const colWidth = size / cols;
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (c + r) % 2 === 0 ? '#9096a0' : '#7b8089';
      ctx.fillRect(x0 + c * colWidth + 1, y0 + r * rowHeight + 1, colWidth - 2, rowHeight - 2);
    }
  }
}

function drawAtlas(ctx: CanvasRenderingContext2D): void {
  const half = ATLAS_SIZE / 2;
  drawWallQuarter(ctx, 0, 0, half, WALL_LOOKS.home);
  drawWallQuarter(ctx, half, 0, half, WALL_LOOKS.apartment);
  drawWallQuarter(ctx, 0, half, half, WALL_LOOKS.shop);
  drawRoofQuarter(ctx, half, half, half);
}

export function createBuildingTextures(
  getContext: () => CanvasRenderingContext2D | null,
): BuildingTextures {
  const ctx = getContext();
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
  return { atlas, ramp: createToonRamp() };
}