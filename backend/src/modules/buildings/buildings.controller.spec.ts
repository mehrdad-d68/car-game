import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BuildingsController } from './buildings.controller';
import { BuildingsService } from './buildings.service';
import { PartMaterial } from './building-spec';
import { BUILDING_SPECS } from './data/building-specs';

const MATERIALS: readonly PartMaterial[] = ['wall', 'glass', 'roof', 'trim', 'door', 'shopfront'];

describe('BuildingsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BuildingsController],
      providers: [BuildingsService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the building catalog', async () => {
    const res = await request(app.getHttpServer()).get('/buildings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(BUILDING_SPECS.length);
    expect(res.body[0].parts.length).toBeGreaterThan(0);
  });

  it('serves placements as an array', async () => {
    const res = await request(app.getHttpServer()).get('/buildings/placements');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('serves assignments as an object keyed by building id', async () => {
    const res = await request(app.getHttpServer()).get('/buildings/assignments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
    const ids = Object.keys(res.body as Record<string, unknown>);
    expect(ids.length).toBeGreaterThan(0);
    const first = (res.body as Record<string, { spec: string | null }>)[ids[0]];
    expect(BUILDING_SPECS.some((spec) => spec.id === first.spec)).toBe(true);
  });

  it('serves one building by id', async () => {
    const res = await request(app.getHttpServer()).get('/buildings/house');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('house');
    expect(res.body.footprint.tolerance).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app.getHttpServer()).get('/buildings/nope');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a known building with no model', async () => {
    const res = await request(app.getHttpServer()).get('/buildings/house/model');
    expect(res.status).toBe(404);
  });
});

describe('Building catalog data', () => {
  it('gives every part of every spec a material that exists', () => {
    for (const spec of BUILDING_SPECS) {
      for (const part of spec.parts) {
        expect(MATERIALS).toContain(part.material);
      }
    }
  });

  it('keeps every spec id unique', () => {
    const ids = BUILDING_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});