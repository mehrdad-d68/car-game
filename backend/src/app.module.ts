import { Module } from '@nestjs/common';
import { AppModule as FeatureAppModule } from './modules/app/app.module';

@Module({
  imports: [FeatureAppModule],
})
export class AppModule {}
