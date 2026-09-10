import { MAP_ITEM_KINDS } from './osm-types';

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkMeta(meta: unknown, errors: string[]): void {
  if (!isObject(meta)) {
    errors.push('meta must be an object');
    return;
  }
  if (typeof meta.source !== 'string') errors.push('meta.source must be a string');
  if (typeof meta.generatedAt !== 'string') {
    errors.push('meta.generatedAt must be a string');
  }
  if (typeof meta.place !== 'string') errors.push('meta.place must be a string');
  if (!isNumber(meta.totalRoads)) {
    errors.push('meta.totalRoads must be a finite number');
  }

  if (!isObject(meta.center)) {
    errors.push('meta.center must be an object');
  } else {
    if (!isNumber(meta.center.lat)) {
      errors.push('meta.center.lat must be a finite number');
    }
    if (!isNumber(meta.center.lng)) {
      errors.push('meta.center.lng must be a finite number');
    }
  }

  if (!isObject(meta.bbox)) {
    errors.push('meta.bbox must be an object');
  } else {
    for (const key of ['south', 'west', 'north', 'east']) {
      if (!isNumber(meta.bbox[key])) {
        errors.push(`meta.bbox.${key} must be a finite number`);
      }
    }
  }
}

function checkRoad(road: unknown, errors: string[], index: number): void {
  const where = `roads[${index}]`;
  if (!isObject(road)) {
    errors.push(`${where} must be an object`);
    return;
  }
  if (!isNumber(road.id)) errors.push(`${where}.id must be a finite number`);
  if (typeof road.type !== 'string') errors.push(`${where}.type must be a string`);
  if (typeof road.name !== 'string') errors.push(`${where}.name must be a string`);
  if (!isNumber(road.lanes)) errors.push(`${where}.lanes must be a finite number`);
  if (!isNumber(road.width)) errors.push(`${where}.width must be a finite number`);
  if (road.oneway !== 0 && road.oneway !== 1 && road.oneway !== -1) {
    errors.push(`${where}.oneway must be one of 0, 1, -1`);
  }
  if (typeof road.access !== 'string') errors.push(`${where}.access must be a string`);

  if (!Array.isArray(road.points)) {
    errors.push(`${where}.points must be an array`);
    return;
  }
  if (road.points.length < 2) {
    errors.push(`${where}.points must contain at least 2 points`);
  }
  road.points.forEach((point, pointIndex) => {
    const at = `${where}.points[${pointIndex}]`;
    if (!isObject(point)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (!isNumber(point.x)) errors.push(`${at}.x must be a finite number`);
    if (!isNumber(point.z)) errors.push(`${at}.z must be a finite number`);
  });
}

function checkItemBase(
  item: Record<string, unknown>,
  errors: string[],
  where: string,
): void {
  if (!isNumber(item.id)) errors.push(`${where}.id must be a finite number`);
  if (!isNumber(item.x)) errors.push(`${where}.x must be a finite number`);
  if (!isNumber(item.z)) errors.push(`${where}.z must be a finite number`);
}

function checkFootprint(
  item: Record<string, unknown>,
  errors: string[],
  where: string,
): void {
  for (const key of ['width', 'depth', 'area'] as const) {
    const value = item[key];
    if (value === undefined) continue;
    if (!isNumber(value) || value < 0) {
      errors.push(`${where}.${key} must be a non-negative finite number`);
    }
  }
}

function checkItem(item: unknown, errors: string[], where: string): void {
  if (!isObject(item)) {
    errors.push(`${where} must be an object`);
    return;
  }
  if (typeof item.kind !== 'string') {
    errors.push(`${where}.kind must be a string`);
    return;
  }
  if (!(MAP_ITEM_KINDS as readonly string[]).includes(item.kind)) {
    errors.push(`${where}.kind must be one of ${MAP_ITEM_KINDS.join(', ')}`);
    return;
  }
  checkItemBase(item, errors, where);
  switch (item.kind) {
    case 'busStop':
      if (typeof item.name !== 'string') errors.push(`${where}.name must be a string`);
      if (item.type !== 'platform' && item.type !== 'stop_position') {
        errors.push(`${where}.type must be either 'platform' or 'stop_position'`);
      }
      checkFootprint(item, errors, where);
      break;
    case 'gasStation':
    case 'fireStation':
    case 'hospital':
    case 'policeStation':
      if (typeof item.name !== 'string') errors.push(`${where}.name must be a string`);
      checkFootprint(item, errors, where);
      break;
  }
}

function checkItems(
  list: unknown,
  errors: string[],
  path: string,
): void {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push(`${path} must be an array`);
    return;
  }
  list.forEach((item, index) => checkItem(item, errors, `${path}[${index}]`));
}

export function validateMapData(value: unknown): MapValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push('Map root must be an object');
  } else {
    checkMeta(value.meta, errors);
    if (!Array.isArray(value.roads)) {
      errors.push('roads must be an array');
    } else {
      value.roads.forEach((road, index) => checkRoad(road, errors, index));
    }
    checkItems(value.items, errors, 'items');
  }
  return { valid: errors.length === 0, errors };
}