import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MapService } from './map.service';

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
}
