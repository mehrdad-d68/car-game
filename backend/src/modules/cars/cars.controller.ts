import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import type { CarSpec } from './car-spec';
import { CarsService } from './cars.service';

const MODEL_CONTENT_TYPE = 'model/gltf-binary';

@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Get()
  findAll(): CarSpec[] {
    return this.carsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): CarSpec {
    const car = this.carsService.findOne(id);
    if (!car) {
      throw new NotFoundException(`Car "${id}" not found`);
    }
    return car;
  }

  @Get(':id/model')
  getModel(@Param('id') id: string, @Req() req: Request, @Res() res: Response): void {
    if (!this.carsService.findOne(id)) {
      throw new NotFoundException(`Car "${id}" not found`);
    }
    const path = this.carsService.getModelPath(id);
    if (!path) {
      throw new NotFoundException(`Car "${id}" has no model`);
    }
    const etag = this.carsService.getModelEtag(path);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', MODEL_CONTENT_TYPE);
    const stream = createReadStream(path);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  }
}