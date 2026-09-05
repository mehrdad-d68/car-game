import { Module } from '@nestjs/common';
import { MapModule } from './modules/map/map.module';
import { CarsModule } from './modules/cars/cars.module';

@Module({
  imports: [MapModule, CarsModule],
})
export class AppModule {}
