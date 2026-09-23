import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CarsService } from '../src/modules/cars/cars.service';
import { CAR_MODELS } from '../src/modules/cars/data/car-models';
import { BuildingsService } from '../src/modules/buildings/buildings.service';
import { BUILDING_MODELS } from '../src/modules/buildings/data/building-models';
import { MapService } from '../src/modules/map/map.service';
import { PropsService } from '../src/modules/props/props.service';
import { PROP_MODELS } from '../src/modules/props/data/prop-models';

const DEFAULT_API_DIR = resolve(__dirname, '../../frontend/public/api');
const MAP_DATA_FILE = resolve(__dirname, '../src/modules/map/data/vienna-roads.json');

export interface ExportedFile {
  path: string;
  bytes: number;
}

export interface ExportReport {
  apiDir: string;
  files: ExportedFile[];
  totalBytes: number;
}

function writeJson(apiDir: string, relative: string, value: unknown, files: ExportedFile[]): void {
  const target = join(apiDir, relative);
  mkdirSync(dirname(target), { recursive: true });
  const raw = JSON.stringify(value);
  writeFileSync(target, raw);
  files.push({ path: relative, bytes: Buffer.byteLength(raw, 'utf8') });
}

function copyModel(apiDir: string, relative: string, source: string, files: ExportedFile[]): void {
  const target = join(apiDir, relative);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  files.push({ path: relative, bytes: statSync(target).size });
}

export function exportStatic(
  apiDir: string = DEFAULT_API_DIR,
  mapDataFile: string = MAP_DATA_FILE,
): ExportReport {
  rmSync(apiDir, { recursive: true, force: true });
  mkdirSync(apiDir, { recursive: true });

  const files: ExportedFile[] = [];

  const mapService = new MapService(mapDataFile);
  mapService.onModuleInit();
  try {
    writeJson(apiDir, 'map', mapService.getMap(), files);
  } finally {
    mapService.onModuleDestroy();
  }

  const cars = new CarsService();
  writeJson(apiDir, 'cars/index.html', cars.findAll(), files);
  for (const car of cars.findAll()) {
    writeJson(apiDir, `cars/${car.id}/index.html`, car, files);
  }
  for (const [id, entry] of Object.entries(CAR_MODELS)) {
    copyModel(
      apiDir,
      `cars/${id}/model`,
      join(__dirname, '../src/modules/cars/data', entry.filename),
      files,
    );
  }

  const props = new PropsService();
  writeJson(apiDir, 'props/index.html', props.findAll(), files);
  for (const spec of props.findAll()) {
    writeJson(apiDir, `props/${spec.kind}/index.html`, spec, files);
  }
  for (const [kind, entry] of Object.entries(PROP_MODELS)) {
    copyModel(
      apiDir,
      `props/${kind}/model`,
      join(__dirname, '../src/modules/props/data', entry.filename),
      files,
    );
  }

  const buildings = new BuildingsService();
  writeJson(apiDir, 'buildings/index.html', buildings.findAll(), files);
  writeJson(apiDir, 'buildings/placements', buildings.findPlacements(), files);
  writeJson(apiDir, 'buildings/assignments', buildings.findAssignments(), files);
  for (const building of buildings.findAll()) {
    writeJson(apiDir, `buildings/${building.id}/index.html`, building, files);
  }
  for (const [id, entry] of Object.entries(BUILDING_MODELS)) {
    copyModel(
      apiDir,
      `buildings/${id}/model`,
      join(__dirname, '../src/modules/buildings/data', entry.filename),
      files,
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return { apiDir, files, totalBytes };
}

function main(): void {
  const report = exportStatic();
  console.log(`exported API → ${report.apiDir}`);
  for (const file of report.files) {
    console.log(`  ${file.path.padEnd(40)} ${file.bytes.toString().padStart(10)} bytes`);
  }
  console.log(`${report.files.length} files, ${report.totalBytes} bytes total`);
}

if (require.main === module) {
  main();
}