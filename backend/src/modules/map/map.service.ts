import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OSMMapData } from './osm-types';

export const MAP_DATA_PATH = 'MAP_DATA_PATH';

@Injectable()
export class MapService implements OnModuleInit {
  private data: OSMMapData | null = null;
  private etag = '';

  constructor(@Inject(MAP_DATA_PATH) private readonly dataPath: string) {}

  onModuleInit(): void {
    const raw = readFileSync(this.dataPath, 'utf8');
    this.data = JSON.parse(raw) as OSMMapData;
    this.etag = `"${createHash('sha1').update(raw).digest('hex')}"`;
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
}
