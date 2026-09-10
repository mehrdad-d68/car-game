import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MapController } from './map.controller';
import { MapService } from './map.service';

describe('MapController', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let mapService: { replaceMap: jest.Mock };

    beforeAll(async () => {
      mapService = { replaceMap: jest.fn() };
      moduleRef = await Test.createTestingModule({
        controllers: [MapController],
        providers: [
          {
            provide: MapService,
            useValue: {
              getEtag: () => '""',
              getMap: () => ({ meta: {}, roads: [] }),
              replaceMap: mapService.replaceMap,
            },
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      app.useBodyParser('json', { limit: '25mb' });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mapService.replaceMap.mockClear();
    });

  const validBody = {
    meta: {
      source: 'openstreetmap',
      generatedAt: '2026-09-04T11:47:45.177Z',
      place: 'test',
      center: { lat: 48.14, lng: 16.29 },
      bbox: { south: 48.13, west: 16.25, north: 48.16, east: 16.33 },
      totalRoads: 1,
    },
    roads: [
      {
        id: 1,
        type: 'motorway',
        name: 'Test',
        lanes: 2,
        width: 12,
        oneway: 1,
        access: 'yes',
        points: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
      },
    ],
  };

  it('accepts a well-formed map with 200 and no errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/map/validate')
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, errors: [] });
  });

  it('rejects a malformed map with structured errors', async () => {
    const bad = structuredClone(validBody);
    (bad.roads as unknown[]).push({ id: 'not-a-number' });

    const res = await request(app.getHttpServer()).post('/map/validate').send(bad);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContain('roads[1].id must be a finite number');
  });

  it('returns 400 for a body that is not JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/map/validate')
      .set('Content-Type', 'application/json')
      .send('{ this is not json');
    expect(res.status).toBe(400);
  });

  it('returns valid:false for an empty body', async () => {
    const res = await request(app.getHttpServer()).post('/map/validate');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, errors: expect.any(Array) });
  });

  it('accepts a map payload larger than the default body limit', async () => {
    const big = structuredClone(validBody);
    const extra: unknown[] = [];
    for (let i = 0; i < 4000; i++) {
      extra.push({
        id: i,
        type: 'residential',
        name: `R${i}`,
        lanes: 1,
        width: 6,
        oneway: 0,
        access: 'yes',
        points: [
          { x: i, z: 0 },
          { x: i + 1, z: 0 },
        ],
      });
    }
    (big as { roads: unknown[] }).roads = extra;

    const res = await request(app.getHttpServer())
      .post('/map/validate')
      .send(big);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('saves a well-formed map via POST /map', async () => {
    const res = await request(app.getHttpServer()).post('/map').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, errors: [] });
    expect(mapService.replaceMap).toHaveBeenCalledTimes(1);
    expect(mapService.replaceMap).toHaveBeenCalledWith(validBody);
  });

  it('does not save a malformed map', async () => {
    const bad = structuredClone(validBody);
    (bad.roads as unknown[]).push({ id: 'not-a-number' });

    const res = await request(app.getHttpServer()).post('/map').send(bad);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(mapService.replaceMap).not.toHaveBeenCalled();
  });
});