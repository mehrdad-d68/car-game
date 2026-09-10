import { Module } from '@nestjs/common';
import { PropsController } from './props.controller';
import { PropsService } from './props.service';

@Module({
  controllers: [PropsController],
  providers: [PropsService],
  exports: [PropsService],
})
export class PropsModule {}