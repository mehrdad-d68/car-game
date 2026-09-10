import * as THREE from 'three';
import { RoadClass } from '../sim/track';
import { Vec2 } from '../sim/types';

const CANVAS_SIZE = 256;

const TILE_METRES = 4;

const ROAD_LOOKS: Record<RoadClass, { base: number; noise: number; patches: number }> = {
  major: { base: 96, noise: 16, patches: 6 },
  street: { base: 108, noise: 16, patches: 6 },
  service: { base: 122, noise: 22, patches: 4 },
  shared: { base: 142, noise: 10, patches: 0 },
};

function putPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function generateAsphaltData(
  ctx: CanvasRenderingContext2D,
  base: number,
  noise: number,
  patches: number,
): void {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (let i = 0; i < 12000; i++) {
    const x = Math.floor(Math.random() * CANVAS_SIZE);
    const y = Math.floor(Math.random() * CANVAS_SIZE);
    const v = Math.floor(base + (Math.random() - 0.5) * noise);
    putPixel(ctx, x, y, `rgb(${v},${v},${v})`);
  }

  for (let i = 0; i < patches; i++) {
    const cx = Math.random() * CANVAS_SIZE;
    const cy = Math.random() * CANVAS_SIZE;
    const r = 10 + Math.random() * 30;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const shade = base - 8 - Math.floor(Math.random() * 10);
    grad.addColorStop(0, `rgba(${shade},${shade},${shade},0.7)`);
    grad.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

export interface RoadTextures {
  major: THREE.CanvasTexture | THREE.Texture;
  street: THREE.CanvasTexture | THREE.Texture;
  service: THREE.CanvasTexture | THREE.Texture;
  shared: THREE.CanvasTexture | THREE.Texture;
  sidewalk: THREE.CanvasTexture | THREE.Texture;
  ground: THREE.CanvasTexture | THREE.Texture;
}

function generateSidewalkData(ctx: CanvasRenderingContext2D, base: number): void {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const tiles = 8;
  const cell = CANVAS_SIZE / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const v = base + ((tx + ty) % 2 === 0 ? 6 : -3) + Math.floor((Math.random() - 0.5) * 8);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(tx * cell, ty * cell, cell, cell);
      ctx.strokeStyle = `rgba(0,0,0,0.22)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx * cell + 0.5, ty * cell + 0.5, cell - 1, cell - 1);
    }
  }
}

function generateCobblestoneData(ctx: CanvasRenderingContext2D, base: number): void {
  const cols = Math.floor(Math.random() * 3) + 6;
  const rows = Math.floor(Math.random() * 3) + 6;
  const cellW = CANVAS_SIZE / cols;
  const cellH = CANVAS_SIZE / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = base + Math.floor((Math.random() - 0.5) * 30);
      const w = cellW * 0.9;
      const h = cellH * 0.75;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.ellipse(
        c * cellW + cellW / 2,
        r * cellH + cellH / 2,
        w / 2,
        h / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = `rgba(0,0,0,0.25)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function generateGrassData(ctx: CanvasRenderingContext2D): void {
  const r0 = 0x6f9a55 >> 16 & 255;
  const g0 = 0x6f9a55 >> 8 & 255;
  const b0 = 0x6f9a55 & 255;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = `rgb(${r0},${g0},${b0})`;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const cx = Math.random() * CANVAS_SIZE;
    const cy = Math.random() * CANVAS_SIZE;
    const r = 40 + Math.random() * 60;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tint = Math.floor(Math.random() * 26) - 12;
    grad.addColorStop(0, `rgba(${(r0 + tint).toFixed(0)},${(g0 + tint).toFixed(0)},${(b0 + tint).toFixed(0)},0.35)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  for (let i = 0; i < 20000; i++) {
    const x = Math.floor(Math.random() * CANVAS_SIZE);
    const y = Math.floor(Math.random() * CANVAS_SIZE);
    const dr = Math.floor((Math.random() - 0.5) * 24);
    const dg = Math.floor((Math.random() - 0.5) * 24);
    const db = Math.floor((Math.random() - 0.5) * 24);
    ctx.fillStyle = `rgba(${clamp255(r0 + dr)},${clamp255(g0 + dg)},${clamp255(b0 + db)},0.5)`;
    ctx.fillRect(x, y, 1, 1);
  }

  for (let i = 0; i < 3000; i++) {
    const x = Math.floor(Math.random() * CANVAS_SIZE);
    const y = Math.floor(Math.random() * CANVAS_SIZE);
    const dr = -20 + Math.floor(Math.random() * 8);
    const dg = -20 + Math.floor(Math.random() * 8);
    const db = -20 + Math.floor(Math.random() * 8);
    ctx.fillStyle = `rgba(${clamp255(r0 + dr)},${clamp255(g0 + dg)},${clamp255(b0 + db)},0.6)`;
    ctx.fillRect(x, y, 1, 1);
  }
}

function textureFromContext(
  ctx: CanvasRenderingContext2D | null,
  gen: (c: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture | THREE.Texture {
  if (!ctx) {
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  gen(ctx);
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRoadTextures(
  getContext: (kind: string) => CanvasRenderingContext2D | null,
): RoadTextures {
  const asphalt = (cls: RoadClass) =>
    textureFromContext(getContext(cls), (c) => {
      const look = ROAD_LOOKS[cls];
      generateAsphaltData(c, look.base, look.noise, look.patches);
    });
  const major = asphalt('major');
  const street = asphalt('street');
  const service = asphalt('service');
  const shared = textureFromContext(getContext('shared'), (c) =>
    generateCobblestoneData(c, ROAD_LOOKS.shared.base),
  );
  const sidewalk = textureFromContext(getContext('sidewalk'), (c) =>
    generateSidewalkData(c, 176),
  );
  const ground = textureFromContext(getContext('ground'), generateGrassData);

  for (const tex of [major, street, service, shared, sidewalk, ground]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 4;
  }

  return { major, street, service, shared, sidewalk, ground };
}

export const metresToUv = (metres: number): number => metres / TILE_METRES;

export function cumulativeDistances(points: Vec2[]): number[] {
  const out: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(
      out[out.length - 1] +
        Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z),
    );
  }
  return out;
}