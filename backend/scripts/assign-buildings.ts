import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chooseSpec,
  fitSpec,
} from '../../frontend/src/app/features/game/engine/sim/building-catalog';
import {
  createBuildings,
  RawBuilding,
} from '../../frontend/src/app/features/game/engine/sim/buildings';
import type {
  BuildingAssignment,
  BuildingAssignments,
  BuildingSpec,
} from '../../frontend/src/app/features/game/engine/sim/building-spec';
import { BUILDING_SPECS } from '../src/modules/buildings/data/building-specs';

const MAP_FILE = resolve(__dirname, '../src/modules/map/data/vienna-roads.json');
const OUT_FILE = resolve(__dirname, '../src/modules/buildings/data/building-assignments.json');

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function readExisting(path: string): BuildingAssignments {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as BuildingAssignments;
}

function main(): void {
  const data = JSON.parse(readFileSync(MAP_FILE, 'utf8')) as { buildings: RawBuilding[] };
  const buildings = createBuildings(data.buildings);
  const specs = BUILDING_SPECS as unknown as BuildingSpec[];
  const previous = readExisting(OUT_FILE);

  const assignments: BuildingAssignments = {};
  const perSpec = new Map<string, number>();
  for (const building of buildings) {
    const spec = chooseSpec(building, specs);
    if (!spec) continue;
    const fit = fitSpec(building, spec);
    if (!fit) continue;
    const entry: BuildingAssignment = {
      spec: spec.id,
      yaw: round(fit.yaw, 5),
      scale: [round(fit.scale.x, 4), round(fit.scale.z, 4)],
    };
    assignments[String(building.id)] = entry;
    perSpec.set(spec.id, (perSpec.get(spec.id) ?? 0) + 1);
  }

  const ordered: BuildingAssignments = {};
  for (const id of Object.keys(assignments).sort((a, b) => Number(a) - Number(b))) {
    ordered[id] = assignments[id];
  }
  writeFileSync(OUT_FILE, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');

  let gained = 0;
  let lost = 0;
  let changed = 0;
  for (const id of Object.keys(ordered)) {
    const before = previous[id];
    if (!before) gained += 1;
    else if (before.spec !== ordered[id].spec) changed += 1;
  }
  for (const id of Object.keys(previous)) {
    if (!ordered[id]) lost += 1;
  }

  const total = buildings.length;
  const claimed = Object.keys(ordered).length;
  console.log(`buildings ${total}, assigned ${claimed} (${((claimed / total) * 100).toFixed(1)}%)`);
  for (const spec of specs) {
    console.log(`  ${spec.id.padEnd(20)} ${String(perSpec.get(spec.id) ?? 0).padStart(5)}`);
  }
  console.log(`since the last run: gained ${gained}, lost ${lost}, changed design ${changed}`);
  console.log(`wrote ${OUT_FILE}`);
}

main();
