import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chooseSpec,
  fitSpec,
} from '../../frontend/src/app/features/game/engine/sim/building-catalog';
import { createBuildings, RawBuilding } from '../../frontend/src/app/features/game/engine/sim/buildings';
import type { BuildingSpec } from '../../frontend/src/app/features/game/engine/sim/building-spec';
import { BUILDING_SPECS } from '../src/modules/buildings/data/building-specs';

function main(): void {
  const file = resolve(__dirname, '../src/modules/map/data/vienna-roads.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as { buildings: RawBuilding[] };
  const buildings = createBuildings(data.buildings);
  const specs = BUILDING_SPECS as unknown as BuildingSpec[];

  const typeCounts = new Map<string, number>();
  let genericYes = 0;
  const bySpec = new Map<string, { rules: number; placed: number }>();
  for (const spec of specs) bySpec.set(spec.id, { rules: 0, placed: 0 });
  let claimed = 0;

  for (const building of buildings) {
    typeCounts.set(building.type, (typeCounts.get(building.type) ?? 0) + 1);
    if (building.type === 'yes') genericYes += 1;
    const spec = chooseSpec(building, specs);
    if (!spec) continue;
    bySpec.get(spec.id)!.rules += 1;
    if (fitSpec(building, spec)) {
      bySpec.get(spec.id)!.placed += 1;
      claimed += 1;
    }
  }

  console.log(`Buildings parsed: ${buildings.length}`);
  for (const spec of specs) {
    const counts = bySpec.get(spec.id)!;
    console.log(
      `  ${spec.id.padEnd(16)} rules ${String(counts.rules).padStart(5)}  placed ${String(counts.placed).padStart(5)}`,
    );
  }
  console.log(`Claimed by a spec (placeable): ${claimed} (${((claimed / buildings.length) * 100).toFixed(1)}%)`);
  console.log(`Generic type 'yes' buildings: ${genericYes} (${((genericYes / buildings.length) * 100).toFixed(1)}%)`);
  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('Top OSM building types:');
  for (const [type, count] of sorted.slice(0, 12)) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
}

main();