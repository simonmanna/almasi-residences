import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PublicService, type PublicResidenceFilter } from './public.service.js';

/**
 * §22 — the public read API the website renders. Read-only, no auth, and
 * nothing private: see the field-by-field selects in PublicService.
 */
@Controller()
export class PublicController {
  constructor(private readonly svc: PublicService) {}

  @Get('property')
  @PublicCache()
  property() {
    return this.svc.property();
  }

  @Get('floors')
  @PublicCache()
  floors() {
    return this.svc.floors();
  }

  @Get('floors/:id')
  @PublicCache()
  floor(@Param('id') id: string) {
    return this.svc.floor(id);
  }

  @Get('residences')
  @PublicCache()
  residences(@Query() q: PublicResidenceFilter) {
    return this.svc.residences(q);
  }

  @Get('residences/featured')
  @PublicCache()
  featured() {
    return this.svc.residences({ featured: 'true' });
  }

  @Get('residences/:code')
  @PublicCache()
  residence(@Param('code') code: string) {
    return this.svc.residence(code);
  }

  @Get('amenities')
  @PublicCache()
  amenities() {
    return this.svc.amenities();
  }

  @Get('galleries')
  @PublicCache()
  galleries() {
    return this.svc.galleries();
  }

  @Get('galleries/:slug')
  @PublicCache()
  gallery(@Param('slug') slug: string) {
    return this.svc.gallery(slug);
  }

  @Get('media')
  @PublicCache()
  media(@Query('category') category?: string, @Query('collection') collection?: string) {
    return this.svc.media(category, collection === 'FLOOR_PLAN' || collection === 'DESIGN' ? collection : undefined);
  }

  @Get('parking')
  @PublicCache()
  parking() {
    return this.svc.parking();
  }

  @Get('payment-plans')
  @PublicCache()
  paymentPlans() {
    return this.svc.paymentPlans();
  }

  @Get('pages')
  @PublicCache()
  pages() {
    return this.svc.pages();
  }

  @Get('pages/:key')
  @PublicCache()
  page(@Param('key') key: string) {
    return this.svc.page(key);
  }

  @Get('faqs')
  @PublicCache()
  faqs() {
    return this.svc.faqs();
  }
}
