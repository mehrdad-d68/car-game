import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import type {
  BuildingAssignments,
  BuildingPlacement,
  BuildingSpec,
} from './building-spec';
import { BuildingsService } from './buildings.service';

const MODEL_CONTENT_TYPE = 'model/gltf-binary';

@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  findAll(): BuildingSpec[] {
    return this.buildingsService.findAll();
  }

  @Get('placements')
  findPlacements(): BuildingPlacement[] {
    return this.buildingsService.findPlacements();
  }

  @Get('assignments')
  findAssignments(): BuildingAssignments {
    return this.buildingsService.findAssignments();
  }

  @Get(':id')
  findOne(@Param('id') id: string): BuildingSpec {
    const building = this.buildingsService.findOne(id);
    if (!building) {
      throw new NotFoundException(`Building "${id}" not found`);
    }
    return building;
  }

  @Get(':id/model')
  getModel(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    if (!this.buildingsService.findOne(id)) {
      throw new NotFoundException(`Building "${id}" not found`);
    }
    const path = this.buildingsService.getModelPath(id);
    if (!path) {
      throw new NotFoundException(`Building "${id}" has no model`);
    }
    const etag = this.buildingsService.getModelEtag(path);
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
