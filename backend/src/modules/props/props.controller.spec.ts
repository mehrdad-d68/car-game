import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PropsController } from './props.controller';
import { PropsService } from './props.service';
import { MAP_ITEM_KINDS } from '../map/osm-types';

describe('PropsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PropsController],
      providers: [PropsService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the full prop catalog', async () => {
    const res = await request(app.getHttpServer()).get('/props');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(MAP_ITEM_KINDS.length);
  });

  it('serves one spec by kind', async () => {
    const res = await request(app.getHttpServer()).get('/props/gasStation');
    expect(res.status).toBe(200);
    const spec = res.body as { kind: string; variants: { parts: unknown[] }[] };
    expect(spec.kind).toBe('gasStation');
    expect(spec.variants[0].parts.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown kind', async () => {
    const res = await request(app.getHttpServer()).get('/props/nope');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a known kind with no model', async () => {
    const res = await request(app.getHttpServer()).get(
      '/props/gasStation/model',
    );
    expect(res.status).toBe(404);
  });
});
