import { Test } from '@nestjs/testing';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapService, MAP_DATA_PATH } from './map.service';

describe('MapService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'map-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function createService(file: string): Promise<MapService> {
    const moduleRef = await Test.createTestingModule({
      providers: [MapService, { provide: MAP_DATA_PATH, useValue: file }],
    }).compile();
    return moduleRef.get(MapService);
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
});
