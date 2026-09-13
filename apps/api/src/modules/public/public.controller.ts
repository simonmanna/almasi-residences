import { Controller, Get, Headers, Param, Query, Res, UseInterceptors, UnauthorizedException } from '@nestjs/common';
import { PreviewInterceptor, verifyPreviewToken } from '../../common/preview.js';
import { NoStore } from '../../common/cache-control.decorator.js';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { BrochureService } from './brochure.service.js';
import { PublicService, type PublicResidenceFilter } from './public.service.js';
import type { FastifyReply } from 'fastify';

/**
 * §22 — the public read API the website renders. Read-only, no auth, and
 * nothing private: see the field-by-field selects in PublicService.
 */
// §40.2 — a signed preview token on the request shows drafts; nothing else does.
@UseInterceptors(PreviewInterceptor)
@Controller()
export class PublicController {
  constructor(
    private readonly svc: PublicService,
    private readonly brochures: BrochureService,
  ) {}

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

  /** Roadmap item 49 — the brochure, generated from live data at the moment of download. */
  @Get('residences/:code/brochure.pdf')
  async brochure(@Param('code') code: string, @Res() reply: FastifyReply) {
    const { filename, pdf } = await this.brochures.residence(code);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      // Short: a brochure must not outlive a price change by more than a minute.
      .header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60')
      .send(pdf);
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

  @Get('media-slots')
  @PublicCache()
  slots() {
    return this.svc.slots();
  }

  @Get('tours/:slug')
  @PublicCache()
  tour(@Param('slug') slug: string) {
    return this.svc.tour(slug);
  }

  @Get('film')
  @PublicCache()
  film() {
    return this.svc.film();
  }

  @Get('seo')
  @PublicCache()
  seo() {
    return this.svc.seo();
  }

  @Get('typology-cards')
  @PublicCache()
  typologyCards() {
    return this.svc.typologyCards();
  }

  /** The website asks before entering Draft Mode: is this preview token genuine and unexpired? */
  @Get('preview/verify')
  @NoStore()
  verifyPreview(@Headers('x-preview-token') token?: string) {
    const ok = verifyPreviewToken(token);
    if (!ok) throw new UnauthorizedException('This preview link has expired. Open a new one from the admin.');
    return { ok: true, expiresAt: new Date(ok.exp * 1000) };
  }
}
