import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MapController } from './map.controller';
import { MapService } from './map.service';

describe('MapController', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const map = { meta: { place: 'test' }, roads: [] };
  const etag = '"abc123"';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [MapController],
      providers: [
        {
          provide: MapService,
          useValue: {
            getEtag: () => etag,
            getMap: () => map,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the map JSON with an etag header', async () => {
    const res = await request(app.getHttpServer()).get('/map');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(map);
    expect(res.headers['etag']).toBe(etag);
  });

  it('returns 304 when the client already has the current etag', async () => {
    const res = await request(app.getHttpServer())
      .get('/map')
      .set('If-None-Match', etag);
    expect(res.status).toBe(304);
  });

  it('returns 200 with the map when the client etag is stale', async () => {
    const res = await request(app.getHttpServer())
      .get('/map')
      .set('If-None-Match', '"stale"');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(map);
  });
});