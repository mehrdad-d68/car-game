import { Module } from '@nestjs/common';
import { MapModule } from './modules/map/map.module';
import { CarsModule } from './modules/cars/cars.module';
import { PropsModule } from './modules/props/props.module';
import { BuildingsModule } from './modules/buildings/buildings.module';

@Module({
  imports: [MapModule, CarsModule, PropsModule, BuildingsModule],
})
export class AppModule {}
