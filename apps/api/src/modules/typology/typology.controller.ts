import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { PreviewInterceptor } from '../../common/preview.js';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { TypologyService } from './typology.service.js';

// §40.2 — a signed preview token on the request shows drafts; nothing else does.
@UseInterceptors(PreviewInterceptor)
@Controller('typology')
export class TypologyController {
  constructor(private readonly typology: TypologyService) {}

  @Get(':devSlug')
  @PublicCache()
  list(@Param('devSlug') devSlug: string) {
    return this.typology.list(devSlug);
  }

  @Get(':devSlug/:typoSlug')
  @PublicCache()
  findOne(@Param('devSlug') devSlug: string, @Param('typoSlug') typoSlug: string) {
    return this.typology.findOne(devSlug, typoSlug);
  }
}
