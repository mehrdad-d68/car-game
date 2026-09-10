import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PropModel, PropSpec } from './prop-spec';
import { PROP_MODELS } from './data/prop-models';
import { PROP_SPECS } from './data/prop-specs';

function modelFor(kind: string): PropModel | undefined {
  if (!Object.hasOwn(PROP_MODELS, kind)) return undefined;
  const entry = PROP_MODELS[kind];
  return {
    url: `/api/props/${kind}/model`,
    targetLength: entry.targetLength,
    yawOffset: entry.yawOffset,
  };
}

function modelEntryOf(kind: string): { filename: string } | undefined {
  return Object.hasOwn(PROP_MODELS, kind) ? PROP_MODELS[kind] : undefined;
}

@Injectable()
export class PropsService {
  private readonly modelEtags = new Map<string, string>();

  findAll(): PropSpec[] {
    return structuredClone(PROP_SPECS).map((spec) => {
      const model = modelFor(spec.kind);
      return model ? { ...spec, model } : spec;
    });
  }

  findOne(kind: string): PropSpec | undefined {
    const seed = PROP_SPECS.find((spec) => spec.kind === kind);
    if (!seed) return undefined;
    const spec = structuredClone(seed);
    const model = modelFor(kind);
    return model ? { ...spec, model } : spec;
  }

  getModelPath(kind: string): string | undefined {
    const entry = modelEntryOf(kind);
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