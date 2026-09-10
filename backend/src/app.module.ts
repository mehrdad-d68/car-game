import { Module } from '@nestjs/common';
import { MapModule } from './modules/map/map.module';
import { CarsModule } from './modules/cars/cars.module';
import { PropsModule } from './modules/props/props.module';

@Module({
  imports: [MapModule, CarsModule, PropsModule],
})
export class AppModule {}
