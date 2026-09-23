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
import type { PropSpec } from './prop-spec';
import { PropsService } from './props.service';

const MODEL_CONTENT_TYPE = 'model/gltf-binary';

@Controller('props')
export class PropsController {
  constructor(private readonly propsService: PropsService) {}

  @Get()
  findAll(): PropSpec[] {
    return this.propsService.findAll();
  }

  @Get(':kind')
  findOne(@Param('kind') kind: string): PropSpec {
    const spec = this.propsService.findOne(kind);
    if (!spec) {
      throw new NotFoundException(`Prop "${kind}" not found`);
    }
    return spec;
  }

  @Get(':kind/model')
  getModel(
    @Param('kind') kind: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    if (!this.propsService.findOne(kind)) {
      throw new NotFoundException(`Prop "${kind}" not found`);
    }
    const path = this.propsService.getModelPath(kind);
    if (!path) {
      throw new NotFoundException(`Prop "${kind}" has no model`);
    }
    const etag = this.propsService.getModelEtag(path);
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
