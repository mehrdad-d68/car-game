import * as THREE from 'three';
import {
  clearModelCache,
  disposeModel,
  fetchModelBinary,
  fitModel,
  flattenTransmission,
  stripLights,
} from './model-loader';

describe('flattenTransmission', () => {
  it('turns transmission glass into plain transparency', () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.9, opacity: 0.16 });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), glass));

    flattenTransmission(group);

    expect(glass.transmission).toBe(0);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.16, 6);
  });

  it('leaves opaque materials alone', () => {
    const wall = new THREE.MeshStandardMaterial();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), wall));

    flattenTransmission(group);

    expect(wall.transparent).toBe(false);
  });
});

describe('stripLights', () => {
  it('removes every light in the model and keeps the meshes', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const nested = new THREE.Group();
    nested.add(new THREE.PointLight(), mesh);
    group.add(new THREE.DirectionalLight(), nested);

    stripLights(group);

    const lights: THREE.Object3D[] = [];
    group.traverse((object) => {
      if (object instanceof THREE.Light) lights.push(object);
    });
    expect(lights).toEqual([]);
    expect(mesh.parent).toBe(nested);
  });
});

describe('fitModel', () => {
  it('derives the scale from the model bounding box length', () => {
    const fit = fitModel(4.942, -0.396, 3.6);
    expect(fit.scale).toBeCloseTo(0.7285, 4);
  });

  it('lifts the model so min.y rests on the ground', () => {
    const fit = fitModel(4.942, -0.396, 3.6);
    expect(fit.lift).toBeCloseTo(0.2885, 4);
  });

  it('does not divide by zero for a zero-length bounding box', () => {
    const fit = fitModel(0, -0.5, 3.6);
    expect(fit.scale).toBe(1);
    expect(fit.lift).toBe(0);
  });

  it('returns an identity fit when the box is already on the ground', () => {
    const fit = fitModel(3.6, 0, 3.6);
    expect(fit.scale).toBeCloseTo(1);
    expect(fit.lift).toBe(0);
  });
});

describe('fetchModelBinary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearModelCache();
  });

  it('fetches a URL once and reuses the bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bytes,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const url = '/api/cars/coupe/model';
    const first = await fetchModelBinary(url);
    const second = await fetchModelBinary(url);

    expect(first).toBe(bytes);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('notifies the cache via its default mode so the ETag can revalidate', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchModelBinary('x');

    expect(fetchMock).toHaveBeenCalledWith('x', { cache: 'default' });
  });

  it('falls back to a forced fetch when the browser revalidates with 304', async () => {
    const bytes = new Uint8Array([5, 6, 7]).buffer;
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 304 };
      }
      return { ok: true, arrayBuffer: async () => bytes };
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = '/api/cars/sport/model';
    const result = await fetchModelBinary(url);

    expect(result).toBe(bytes);
    expect(fetchMock).toHaveBeenNthCalledWith(1, url, { cache: 'default' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, url, { cache: 'reload' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the cache and retries after a failed fetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const url = '/api/cars/truck/model';
    await expect(fetchModelBinary(url)).rejects.toThrow();
    await expect(fetchModelBinary(url)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('drops cached bytes when the model cache is cleared', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const url = '/api/cars/coupe/model';
    await fetchModelBinary(url);
    clearModelCache();
    await fetchModelBinary(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
describe('disposeModel', () => {
  function modelWith(material: THREE.Material): { group: THREE.Group; geometry: THREE.BufferGeometry } {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material));
    return { group, geometry };
  }

  it('disposes a model whose materials have empty texture slots', () => {
    const material = new THREE.MeshStandardMaterial();
    const { group, geometry } = modelWith(material);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');

    expect(() => disposeModel(group)).not.toThrow();
    expect(disposeGeometry).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
  });

  it('disposes the textures a material uses', () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const disposeMap = vi.spyOn(map, 'dispose');

    disposeModel(modelWith(material).group);

    expect(disposeMap).toHaveBeenCalled();
  });
});
