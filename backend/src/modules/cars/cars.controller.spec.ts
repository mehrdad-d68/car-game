import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';

describe('CarsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CarsController],
      providers: [CarsService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the GLB model with the binary content type', async () => {
    const res = await request(app.getHttpServer())
      .get('/cars/coupe/model')
      .responseType('arraybuffer');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('model/gltf-binary');
    expect(res.headers['etag']).toBeDefined();
    expect(res.body.length).toBe(677696);
  });

  it('returns 404 for an unknown car', async () => {
    const res = await request(app.getHttpServer()).get('/cars/nope/model');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a known car with no model', async () => {
    const res = await request(app.getHttpServer()).get('/cars/sport/model');
    expect(res.status).toBe(404);
  });
});