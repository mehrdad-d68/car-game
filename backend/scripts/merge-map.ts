import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeMapData } from './merge-road-ways';
import { OSMMapData } from '../src/modules/map/osm-types';

const DEFAULT_INPUT = 'src/modules/map/data/vienna-roads.json';

const [inputArg, outputArg] = process.argv.slice(2);

const input = resolve(process.cwd(), inputArg ?? DEFAULT_INPUT);
const defaultOutput = input.replace(/\.json$/i, '-merged.json');
const output = resolve(process.cwd(), outputArg ?? defaultOutput);

const raw = readFileSync(input, 'utf8');
const data = JSON.parse(raw) as OSMMapData;
const merged = mergeMapData(data);

writeFileSync(output, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

const before = data.roads.length;
const after = merged.roads.length;
console.log(`roads: ${before} -> ${after} (merged away ${before - after})`);
console.log(`wrote ${output}`);