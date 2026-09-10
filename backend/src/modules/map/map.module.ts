import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { MapController } from './map.controller';
import { MapService, MAP_DATA_PATH } from './map.service';

const MAP_DATA_FILE = join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'modules',
  'map',
  'data',
  'vienna-roads.json',
);

@Module({
  controllers: [MapController],
  providers: [
    MapService,
    { provide: MAP_DATA_PATH, useValue: MAP_DATA_FILE },
  ],
  exports: [MapService],
})
export class MapModule {}
