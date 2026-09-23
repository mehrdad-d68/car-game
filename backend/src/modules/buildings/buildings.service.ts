import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BuildingAssignments,
  BuildingModel,
  BuildingPlacement,
  BuildingSpec,
} from './building-spec';
import { BUILDING_MODELS } from './data/building-models';
import { BUILDING_SPECS } from './data/building-specs';

function modelFor(id: string): BuildingModel | undefined {
  if (!Object.hasOwn(BUILDING_MODELS, id)) return undefined;
  const entry = BUILDING_MODELS[id];
  return {
    url: `/api/buildings/${id}/model`,
    targetWidth: entry.targetWidth,
    yawOffset: entry.yawOffset,
  };
}

export function mergeAssignments(
  generated: BuildingAssignments,
  overrides: BuildingAssignments,
): BuildingAssignments {
  return { ...generated, ...overrides };
}

function modelEntryOf(id: string): { filename: string } | undefined {
  return Object.hasOwn(BUILDING_MODELS, id) ? BUILDING_MODELS[id] : undefined;
}

@Injectable()
export class BuildingsService {
  private readonly modelEtags = new Map<string, string>();
  private placements: BuildingPlacement[] | null = null;
  private assignments: BuildingAssignments | null = null;

  findAll(): BuildingSpec[] {
    return structuredClone(BUILDING_SPECS).map((building) => {
      const model = modelFor(building.id);
      return model ? { ...building, model } : building;
    });
  }

  findPlacements(): BuildingPlacement[] {
    if (this.placements === null) {
      const path = join(__dirname, 'data', 'building-placements.json');
      this.placements = JSON.parse(readFileSync(path, 'utf8')) as BuildingPlacement[];
    }
    return this.placements;
  }

  findAssignments(): BuildingAssignments {
    if (this.assignments === null) {
      this.assignments = mergeAssignments(
        this.readAssignmentFile('building-assignments.json'),
        this.readAssignmentFile('building-overrides.json'),
      );
    }
    return this.assignments;
  }

  private readAssignmentFile(name: string): BuildingAssignments {
    const path = join(__dirname, 'data', name);
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf8')) as BuildingAssignments;
  }

  findOne(id: string): BuildingSpec | undefined {
    const seed = BUILDING_SPECS.find((building) => building.id === id);
    if (!seed) return undefined;
    const building = structuredClone(seed);
    const model = modelFor(id);
    return model ? { ...building, model } : building;
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