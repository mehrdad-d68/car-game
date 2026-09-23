import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { BuildingsService } from '../src/modules/buildings/buildings.service';
import { BUILDING_MODELS } from '../src/modules/buildings/data/building-models';
import { CarsService } from '../src/modules/cars/cars.service';
import { CAR_MODELS } from '../src/modules/cars/data/car-models';
import { PropsService } from '../src/modules/props/props.service';
import { PROP_MODELS } from '../src/modules/props/data/prop-models';
import { exportStatic } from './export-static';

function listFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        found.push(relative(dir, path).replaceAll('\\', '/'));
      }
    }
  };
  walk(dir);
  return found.sort();
}

function readBytes(dir: string): Map<string, string> {
  const contents = new Map<string, string>();
  for (const path of listFiles(dir)) {
    contents.set(path, readFileSync(join(dir, path)).toString('utf8'));
  }
  return contents;
}

describe('exportStatic', () => {
  let apiDir: string;

  beforeEach(() => {
    apiDir = mkdtempSync(join(tmpdir(), 'static-export-'));
  });

  afterEach(() => {
    rmSync(apiDir, { recursive: true, force: true });
  });

  it('emits every path the API serves', () => {
    exportStatic(apiDir);

    const cars = new CarsService();
    const props = new PropsService();
    const buildings = new BuildingsService();

    const expected = [
      'map',
      'cars/index.html',
      ...cars.findAll().map((car) => `cars/${car.id}/index.html`),
      ...Object.keys(CAR_MODELS).map((id) => `cars/${id}/model`),
      'props/index.html',
      ...props.findAll().map((spec) => `props/${spec.kind}/index.html`),
      ...Object.keys(PROP_MODELS).map((kind) => `props/${kind}/model`),
      'buildings/index.html',
      'buildings/placements',
      'buildings/assignments',
      ...buildings.findAll().map((building) => `buildings/${building.id}/index.html`),
      ...Object.keys(BUILDING_MODELS).map((id) => `buildings/${id}/model`),
    ].sort();

    expect(listFiles(apiDir)).toEqual(expected);
  });

  it('emits JSON that every non-model file parses as', () => {
    exportStatic(apiDir);

    for (const path of listFiles(apiDir)) {
      const raw = readFileSync(join(apiDir, path), 'utf8');
      if (/\/model$/.test(path)) continue;
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });

  it('emits api/buildings equal to BuildingsService.findAll()', () => {
    exportStatic(apiDir);

    const emitted = JSON.parse(
      readFileSync(join(apiDir, 'buildings/index.html'), 'utf8'),
    ) as unknown;
    expect(emitted).toEqual(new BuildingsService().findAll());
  });

  it('produces byte-identical output across runs', () => {
    exportStatic(apiDir);
    const first = readBytes(apiDir);

    exportStatic(apiDir);
    const second = readBytes(apiDir);

    expect(second).toEqual(first);
  });
});