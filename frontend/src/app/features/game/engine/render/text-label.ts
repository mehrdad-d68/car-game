import * as THREE from 'three';

const FONT = 'bold 120px Arial';
const TEXT_COLOR = 'white';
const STROKE_COLOR = 'rgba(0,0,0,0.85)';

interface LabelCacheEntry {
  texture: THREE.CanvasTexture;
  geo: THREE.PlaneGeometry;
  mat: THREE.MeshBasicMaterial;
}

const cache = new Map<string, LabelCacheEntry>();

function drawLabel(text: string, color: string): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const scale = 2;

  ctx.font = FONT;
  const textWidth = ctx.measureText(text).width;
  const pad = 30 * scale;

  canvas.width = Math.ceil(textWidth + pad * 2);
  canvas.height = 200 * scale;

  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 22 * scale;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function makeLabelMesh(
  text: string,
  color: string,
): THREE.Mesh | null {
  const key = `${color}:${text}`;
  let entry = cache.get(key);
  if (!entry) {
    const texture = drawLabel(text, color);
    if (!texture) return null;
    const aspect = texture.image.width / texture.image.height;
    const geo = new THREE.PlaneGeometry(10 * aspect, 10);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    entry = { texture, geo, mat };
    cache.set(key, entry);
  }

  return new THREE.Mesh(entry.geo, entry.mat);
}

let arrowGeo: THREE.PlaneGeometry | null = null;
let arrowMat: THREE.MeshBasicMaterial | null = null;

function getArrowResources(): { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } | null {
  if (arrowGeo && arrowMat) {
    return { geo: arrowGeo, mat: arrowMat };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const size = 256;

  canvas.width = size;
  canvas.height = size;

  ctx.fillStyle = STROKE_COLOR;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 28;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const cx = size / 2;
  const cy = size / 2;
  const len = size * 0.5;
  const head = size * 0.22;

  ctx.beginPath();
  ctx.moveTo(cx, cy - len);
  ctx.lineTo(cx, cy + len);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - head, cy + len - head);
  ctx.lineTo(cx, cy + len);
  ctx.lineTo(cx + head, cy + len - head);
  ctx.stroke();

  ctx.fillStyle = TEXT_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx - head, cy + len - head);
  ctx.lineTo(cx, cy + len);
  ctx.lineTo(cx + head, cy + len - head);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - len);
  ctx.lineTo(cx, cy + len - head);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  arrowGeo = new THREE.PlaneGeometry(10, 10);
  arrowMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return { geo: arrowGeo, mat: arrowMat };
}

export function makeArrowMesh(): THREE.Mesh | null {
  const res = getArrowResources();
  if (!res) return null;
  return new THREE.Mesh(res.geo, res.mat);
}

export function disposeLabelCache(): void {
  for (const entry of cache.values()) {
    entry.texture.dispose();
    entry.geo.dispose();
    entry.mat.dispose();
  }
  cache.clear();

  if (arrowGeo) {
    arrowGeo.dispose();
    arrowGeo = null;
  }
  if (arrowMat) {
    arrowMat.dispose();
    arrowMat = null;
  }
}
