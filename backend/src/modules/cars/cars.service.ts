import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CarModel, CarSpec } from './car-spec';
import { CAR_MODELS } from './data/car-models';
import { CAR_SPECS } from './data/car-specs';

function modelFor(id: string): CarModel | undefined {
  if (!Object.hasOwn(CAR_MODELS, id)) return undefined;
  const entry = CAR_MODELS[id];
  return {
    url: `/api/cars/${id}/model`,
    targetLength: entry.targetLength,
    yawOffset: entry.yawOffset,
  };
}

function modelEntryOf(id: string): { filename: string } | undefined {
  return Object.hasOwn(CAR_MODELS, id) ? CAR_MODELS[id] : undefined;
}

@Injectable()
export class CarsService {
  private readonly modelEtags = new Map<string, string>();

  findAll(): CarSpec[] {
    return structuredClone(CAR_SPECS).map((car) => {
      const model = modelFor(car.id);
      return model ? { ...car, model } : car;
    });
  }

  findOne(id: string): CarSpec | undefined {
    const seed = CAR_SPECS.find((car) => car.id === id);
    if (!seed) return undefined;
    const car = structuredClone(seed);
    const model = modelFor(id);
    return model ? { ...car, model } : car;
  }

  getModelPath(id: string): string | undefined {
    const entry = modelEntryOf(id);
    if (!entry) return undefined;
    return join(__dirname, 'data', entry.filename);
  }

  getModelEtag(path: string): string {
    let etag = this.modelEtags.get(path);
    if (etag === undefined) {
      const raw = readFileSync(path);
      etag = `"${createHash('sha1').update(raw).digest('hex')}"`;
      this.modelEtags.set(path, etag);
    }
    return etag;
  }
}
