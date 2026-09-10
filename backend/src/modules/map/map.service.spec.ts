import { Test } from '@nestjs/testing';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapService, MAP_DATA_PATH } from './map.service';
import type { OSMMapData } from './osm-types';

describe('MapService', () => {
  let dir: string;
  let services: MapService[];

  beforeEach(() => {
    services = [];
    dir = mkdtempSync(join(tmpdir(), 'map-test-'));
  });

  afterEach(() => {
    for (const service of services) service.onModuleDestroy();
    rmSync(dir, { recursive: true, force: true });
  });

  async function createService(file: string): Promise<MapService> {
    const moduleRef = await Test.createTestingModule({
      providers: [MapService, { provide: MAP_DATA_PATH, useValue: file }],
    }).compile();
    const service = moduleRef.get(MapService);
    services.push(service);
    return service;
  }

  it('loads the fixture through the injected path', async () => {
    const file = join(dir, 'vienna-roads.json');
    writeFileSync(
      file,
      JSON.stringify({
        meta: { totalRoads: 2 },
        roads: [
          { id: 1, name: 'A', points: [{ x: 0, z: 0 }] },
          { id: 2, name: 'B', points: [{ x: 1, z: 1 }] },
        ],
      }),
    );

    const service = await createService(file);
    service.onModuleInit();

    expect(service.getMap().meta.totalRoads).toBe(2);
    expect(service.getMap().roads).toHaveLength(2);
  });

  it('computes a deterministic etag from the fixture contents', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ roads: [] }));

    const a = await createService(file);
    const b = await createService(file);
    a.onModuleInit();
    b.onModuleInit();

    expect(a.getEtag()).toBe(b.getEtag());
    expect(a.getEtag()).toMatch(/^"/);
  });

  it('throws when accessed before init', async () => {
    const file = join(dir, 'unread.json');
    writeFileSync(file, JSON.stringify({}));

    const service = await createService(file);
    expect(() => service.getMap()).toThrow('Map data not loaded');
  });

  it('replaces the served map and version on disk on save', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ meta: { totalRoads: 1 }, roads: [] }));

    const service = await createService(file);
    service.onModuleInit();
    const before = service.getEtag();
    const replacement: OSMMapData = {
      meta: { totalRoads: 3 },
      roads: [{ id: 9, name: 'New', points: [{ x: 0, z: 0 }, { x: 5, z: 5 }] }],
    };

    service.replaceMap(replacement);

    expect(service.getMap()).toEqual(replacement);
    expect(service.getEtag()).not.toBe(before);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(replacement);
  });

  it('writes atomically and leaves no temp file behind', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ roads: [] }));

    const service = await createService(file);
    service.onModuleInit();
    service.replaceMap({ meta: { totalRoads: 0 }, roads: [] });

    expect(readdirSync(dir).sort()).toEqual(['map.json']);
  });

  it('serves the replaced data immediately and keeps the etag stable across calls', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ roads: [] }));

    const service = await createService(file);
    service.onModuleInit();
    service.replaceMap({ meta: { totalRoads: 7 }, roads: [] });

    expect(service.getMap().meta.totalRoads).toBe(7);
    expect(service.getEtag()).toBe(service.getEtag());
  });

  it('reloads the served map and etag when the data file changes on disk', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ meta: { totalRoads: 1 }, roads: [] }));

    const service = await createService(file);
    service.onModuleInit();
    const before = service.getEtag();
    expect(service.getMap().meta.totalRoads).toBe(1);

    writeFileSync(file, JSON.stringify({ meta: { totalRoads: 99 }, roads: [] }));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(service.getMap().meta.totalRoads).toBe(99);
    expect(service.getEtag()).not.toBe(before);
  });

  it('keeps serving the last good data when the file becomes invalid, then recovers', async () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ meta: { totalRoads: 1 }, roads: [] }));

    const service = await createService(file);
    service.onModuleInit();

    writeFileSync(file, '{ not valid json', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(service.getMap().meta.totalRoads).toBe(1);

    writeFileSync(file, JSON.stringify({ meta: { totalRoads: 2 }, roads: [] }));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(service.getMap().meta.totalRoads).toBe(2);
  });
});
