import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MapService } from './map.service';
import type { OSMMapData } from './osm-types';
import type { MapValidationResult } from './map-validator';
import { validateMapData } from './map-validator';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get()
  getMap(@Req() req: Request, @Res() res: Response): void {
    const etag = this.mapService.getEtag();
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.json(this.mapService.getMap());
  }

  @Post('validate')
  @HttpCode(200)
  validate(@Body() body: unknown): MapValidationResult {
    return validateMapData(body);
  }

  @Post()
  @HttpCode(200)
  replace(@Body() body: unknown): MapValidationResult {
    const result = validateMapData(body);
    if (result.valid) {
      this.mapService.replaceMap(body as OSMMapData);
    }
    return result;
  }
}
