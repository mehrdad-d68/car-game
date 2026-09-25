import * as THREE from 'three';

export interface PropTextures {
  lens: THREE.DataTexture;
  housing: THREE.Texture;
  sign: THREE.Texture;
}

export function createLensTexture(): THREE.DataTexture {
  const S = 32;
  const data = new Uint8Array(S * S * 4);
  const center = (S - 1) / 2;
  const half = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - center) / half;
      const dy = (y - center) / half;
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const value = Math.round(64 + 191 * falloff * falloff);
      const i = (y * S + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const lens = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  lens.minFilter = THREE.LinearFilter;
  lens.magFilter = THREE.LinearFilter;
  lens.needsUpdate = true;
  return lens;
}

export function paintHousing(ctx: CanvasRenderingContext2D): void {
  const S = 128;
  ctx.fillStyle = '#e8e9eb';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#e1e2e5' : '#eceef0';
    ctx.fillRect(x, 0, 2, S);
  }
  ctx.fillStyle = '#d6d8db';
  ctx.fillRect(0, 42, S, 3);
  ctx.fillStyle = '#cdd0d4';
  ctx.fillRect(0, 90, S, 3);
}

export function paintSign(ctx: CanvasRenderingContext2D): void {
  const W = 128;
  const H = 64;
  ctx.fillStyle = '#1e88e5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 8, W - 16, H - 16);
  ctx.fillStyle = '#1e88e5';
  ctx.fillRect(16, 16, W - 32, H - 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(34, 22, 60, 22);
  ctx.beginPath();
  ctx.arc(42, 48, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(86, 48, 6, 0, 2 * Math.PI);
  ctx.fill();
}

export function createPropTextures(
  getContext: (width: number, height: number) => CanvasRenderingContext2D | null,
): PropTextures {
  const housingCtx = getContext(128, 128);
  let housing: THREE.Texture;
  if (housingCtx) {
    paintHousing(housingCtx);
    housing = new THREE.CanvasTexture(housingCtx.canvas);
  } else {
    housing = new THREE.Texture();
  }
  housing.wrapS = THREE.RepeatWrapping;
  housing.wrapT = THREE.RepeatWrapping;
  housing.colorSpace = THREE.SRGBColorSpace;
  housing.anisotropy = 4;
  housing.needsUpdate = true;

  const signCtx = getContext(128, 64);
  let sign: THREE.Texture;
  if (signCtx) {
    paintSign(signCtx);
    sign = new THREE.CanvasTexture(signCtx.canvas);
  } else {
    sign = new THREE.Texture();
  }
  sign.wrapS = THREE.RepeatWrapping;
  sign.wrapT = THREE.RepeatWrapping;
  sign.colorSpace = THREE.SRGBColorSpace;
  sign.anisotropy = 4;
  sign.needsUpdate = true;

  return { lens: createLensTexture(), housing, sign };
}