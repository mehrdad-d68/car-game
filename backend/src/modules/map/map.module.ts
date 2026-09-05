import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { MapController } from './map.controller';
import { MapService, MAP_DATA_PATH } from './map.service';

@Module({
  controllers: [MapController],
  providers: [
    MapService,
    { provide: MAP_DATA_PATH, useValue: join(__dirname, 'data/vienna-roads.json') },
  ],
  exports: [MapService],
})
export class MapModule {}
