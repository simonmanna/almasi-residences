import { Controller, Get, Param } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { TypologyService } from './typology.service.js';

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
