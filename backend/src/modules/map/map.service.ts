import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  watch,
  writeFileSync,
} from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { OSMMapData } from './osm-types';

export const MAP_DATA_PATH = 'MAP_DATA_PATH';

const RELOAD_DEBOUNCE_MS = 200;

function toEtag(raw: string): string {
  return `"${createHash('sha1').update(raw).digest('hex')}"`;
}

@Injectable()
export class MapService implements OnModuleInit, OnModuleDestroy {
  private data: OSMMapData | null = null;
  private etag = '';
  private watcher: FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject(MAP_DATA_PATH) private readonly dataPath: string) {}

  onModuleInit(): void {
    this.reloadFromDisk(true);
    this.startWatching();
  }

  onModuleDestroy(): void {
    this.stopWatching();
  }

  getMap(): OSMMapData {
    if (!this.data) {
      throw new Error('Map data not loaded');
    }
    return this.data;
  }

  getEtag(): string {
    return this.etag;
  }

  replaceMap(data: OSMMapData): void {
    const raw = JSON.stringify(data);
    mkdirSync(dirname(this.dataPath), { recursive: true });
    const tmp = `${this.dataPath}.${process.pid}.tmp`;
    writeFileSync(tmp, raw, 'utf8');
    renameSync(tmp, this.dataPath);
    this.data = data;
    this.etag = toEtag(raw);
  }

  private startWatching(): void {
    const fileName = basename(this.dataPath);
    this.watcher = watch(dirname(this.dataPath), (_event, filename) => {
      if (filename !== fileName) return;
      this.scheduleReload();
    });
    this.watcher.on('error', () => this.stopWatching());
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => this.reloadFromDisk(false), RELOAD_DEBOUNCE_MS);
  }

  private reloadFromDisk(strict: boolean): void {
    try {
      const raw = readFileSync(this.dataPath, 'utf8');
      this.data = JSON.parse(raw) as OSMMapData;
      this.etag = toEtag(raw);
    } catch (err) {
      if (strict) throw err;
    }
  }

  private stopWatching(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}