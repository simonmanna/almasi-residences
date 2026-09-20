import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  SEO_DESCRIPTION_MAX,
  SEO_ENTITY_LABELS,
  SEO_ENTITY_TYPES,
  SEO_ROUTES,
  SEO_TITLE_MAX,
  normalisePath,
  seoEntityPath,
  seoScore,
  type SeoEntityType,
  type SeoIssue,
} from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { residenceSlug } from '../public/public.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined } from './actor.js';
import { UpdateSeoEntityDto, UpdateSeoIntegrationsDto, UpsertRedirectDto } from './dto.js';

/** The `type` the website's residence filter accepts, as the website derives it. */
const residenceTypeKey = (isPenthouse: boolean, bedrooms: number): string =>
  isPenthouse ? 'penthouse' : bedrooms <= 1 ? 'one-bedroom' : bedrooms === 2 ? 'two-bedroom' : 'three-bedroom';

const isEntityType = (v: string): v is SeoEntityType => (SEO_ENTITY_TYPES as readonly string[]).includes(v);

interface SeoRecord {
  id: string;
  label: string;
  slug: string;
  sub?: string;
  published?: boolean;
  /** Set where the record's own slug is not what the URL filters on. */
  path?: string;
}

/**
 * §SEO — the engine every page type shares.
 *
 * Search metadata is data, not code: a residence, a type, a location page and
 * an article all carry the same row, so the website resolves any page's title,
 * description, canonical and schema the same way. What the admin leaves empty
 * is derived from the record itself, never shipped blank.
 */
@Controller('admin/seo')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class SeoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  // ─── Entity metadata ───────────────────────────────────────────────────

  /** Every record of one kind, with the metadata it carries and what is missing. */
  @Get('entities/:type')
  @RequirePermission('content.view')
  async entities(@Param('type') type: string) {
    if (!isEntityType(type)) throw new NotFoundException('No such kind of page');
    const developmentId = await this.dev.id();
    const [rows, records] = await Promise.all([
      this.prisma.client.seoEntity.findMany({ where: { developmentId, entityType: type }, include: { ogImage: true } }),
      this.records(type, developmentId),
    ]);
    return records.map((r) => {
      const row = rows.find((x) => x.entityId === r.id);
      return {
        ...r,
        path: r.path ?? seoEntityPath(type, r.slug),
        seo: row ? { ...row, ogImage: row.ogImage ? this.storage.present(row.ogImage) : null } : null,
      };
    });
  }

  @Get('entities/:type/:id')
  @RequirePermission('content.view')
  async entity(@Param('type') type: string, @Param('id') id: string) {
    if (!isEntityType(type)) throw new NotFoundException('No such kind of page');
    const developmentId = await this.dev.id();
    const [row, records] = await Promise.all([
      this.prisma.client.seoEntity.findUnique({
        where: { developmentId_entityType_entityId: { developmentId, entityType: type, entityId: id } },
        include: { ogImage: true },
      }),
      this.records(type, developmentId),
    ]);
    const record = records.find((r) => r.id === id);
    if (!record) throw new NotFoundException('No such record');
    return {
      ...record,
      path: record.path ?? seoEntityPath(type, record.slug),
      seo: row ? { ...row, ogImage: row.ogImage ? this.storage.present(row.ogImage) : null } : null,
    };
  }

  @Put('entities/:type/:id')
  @RequirePermission('content.edit')
  async saveEntity(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateSeoEntityDto, @Req() req: AdminRequest) {
    if (!isEntityType(type)) throw new NotFoundException('No such kind of page');
    const developmentId = await this.dev.id();
    const records = await this.records(type, developmentId);
    const record = records.find((r) => r.id === id);
    if (!record) throw new NotFoundException('No such record');
    if (dto.ogImageId) {
      const m = await this.prisma.client.media.findFirst({ where: { id: dto.ogImageId, developmentId } });
      if (!m || m.kind !== 'IMAGE') throw new BadRequestException('The share image must be an image of this property.');
    }
    const clean = {
      title: dto.title?.trim() || null,
      metaDescription: dto.metaDescription?.trim() || null,
      canonicalUrl: dto.canonicalUrl?.trim() || null,
      ogTitle: dto.ogTitle?.trim() || null,
      ogDescription: dto.ogDescription?.trim() || null,
      ogImageId: dto.ogImageId ?? null,
      robotsIndex: dto.robotsIndex,
      robotsFollow: dto.robotsFollow,
      schemaType: dto.schemaType ?? null,
      keywords: dto.keywords,
    };
    const row = await this.prisma.client.seoEntity.upsert({
      where: { developmentId_entityType_entityId: { developmentId, entityType: type, entityId: id } },
      create: {
        developmentId,
        entityType: type,
        entityId: id,
        slug: record.slug,
        ...clean,
        robotsIndex: dto.robotsIndex ?? true,
        robotsFollow: dto.robotsFollow ?? true,
        keywords: dto.keywords ?? [],
        updatedById: actorOf(req).id,
      },
      update: { ...defined(clean), slug: record.slug, updatedById: actorOf(req).id },
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'seo.update',
      entity: 'seo',
      entityId: `${type}:${id}`,
      target: record.label,
      summary: `Edited search metadata for ${SEO_ENTITY_LABELS[type].toLowerCase()} ${record.label}`,
      after: { title: row.title, metaDescription: row.metaDescription, robotsIndex: row.robotsIndex },
      req,
    });
    await this.sync.changed('seo');
    return row;
  }

  // ─── Redirects ─────────────────────────────────────────────────────────

  @Get('redirects')
  @RequirePermission('content.view')
  async redirects() {
    const developmentId = await this.dev.id();
    return this.prisma.client.redirect.findMany({ where: { developmentId }, orderBy: [{ enabled: 'desc' }, { fromPath: 'asc' }] });
  }

  @Put('redirects')
  @RequirePermission('content.edit')
  async saveRedirect(@Body() dto: UpsertRedirectDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const fromPath = normalisePath(dto.fromPath);
    const toPath = dto.toPath.startsWith('http') ? dto.toPath.trim() : normalisePath(dto.toPath);
    if (fromPath === toPath) throw new BadRequestException('A redirect cannot point at itself.');
    if (fromPath === '/') throw new BadRequestException('The homepage cannot be redirected away.');
    const row = await this.prisma.client.redirect.upsert({
      where: { developmentId_fromPath: { developmentId, fromPath } },
      create: { developmentId, fromPath, toPath, statusCode: dto.statusCode ?? 301, reason: dto.reason?.trim() || null, enabled: dto.enabled ?? true, createdById: actorOf(req).id },
      update: { toPath, ...defined({ statusCode: dto.statusCode, reason: dto.reason?.trim() || null, enabled: dto.enabled }) },
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'seo.redirect',
      entity: 'redirect',
      entityId: row.id,
      target: fromPath,
      summary: `${fromPath} now redirects to ${toPath}`,
      after: { toPath, statusCode: row.statusCode },
      req,
    });
    await this.sync.changed('seo');
    return row;
  }

  @Delete('redirects/:id')
  @RequirePermission('content.edit')
  @HttpCode(204)
  async removeRedirect(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.redirect.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such redirect');
    await this.prisma.client.redirect.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'seo.redirect', entity: 'redirect', entityId: id, target: row.fromPath, summary: `Removed the redirect from ${row.fromPath}`, req });
    await this.sync.changed('seo');
  }

  // ─── Search-engine and analytics accounts ──────────────────────────────

  @Get('integrations')
  @RequirePermission('content.view')
  async integrations() {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.seoMeta.findUnique({ where: { developmentId } });
    return {
      gscVerification: row?.gscVerification ?? null,
      bingVerification: row?.bingVerification ?? null,
      ga4MeasurementId: row?.ga4MeasurementId ?? null,
      gtmContainerId: row?.gtmContainerId ?? null,
      organizationName: row?.organizationName ?? null,
      organizationType: row?.organizationType ?? 'Organization',
      sameAs: row?.sameAs ?? [],
    };
  }

  @Put('integrations')
  @RequirePermission('content.edit')
  async saveIntegrations(@Body() dto: UpdateSeoIntegrationsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const clean = {
      gscVerification: dto.gscVerification?.trim() || null,
      bingVerification: dto.bingVerification?.trim() || null,
      ga4MeasurementId: dto.ga4MeasurementId?.trim() || null,
      gtmContainerId: dto.gtmContainerId?.trim() || null,
      organizationName: dto.organizationName?.trim() || null,
      organizationType: dto.organizationType,
      sameAs: dto.sameAs?.map((s) => s.trim()).filter(Boolean),
    };
    const row = await this.prisma.client.seoMeta.upsert({
      where: { developmentId },
      create: {
        developmentId,
        title: '',
        description: '',
        keywords: [],
        ...clean,
        organizationType: dto.organizationType ?? 'Organization',
        sameAs: clean.sameAs ?? [],
      },
      update: defined(clean),
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'seo.update', entity: 'seo', entityId: 'integrations', target: 'Search & analytics accounts', summary: 'Edited the search-engine and analytics accounts', req });
    await this.sync.changed('seo');
    return row;
  }

  // ─── Audit ─────────────────────────────────────────────────────────────

  /**
   * The technical health of the site's search metadata, computed from the
   * database rather than crawled: what is missing, what is duplicated and what
   * search engines have been told to ignore.
   */
  @Get('audit')
  @RequirePermission('content.view')
  async auditReport() {
    const developmentId = await this.dev.id();
    const [site, seoPages, entities, units, typologies, locations, posts, images, videos, redirects] = await Promise.all([
      this.prisma.client.seoMeta.findUnique({ where: { developmentId } }),
      this.prisma.client.seoPage.findMany({ where: { developmentId } }),
      this.prisma.client.seoEntity.findMany({ where: { developmentId } }),
      this.prisma.client.unit.findMany({ where: { developmentId, archivedAt: null, published: true }, select: { id: true, code: true, shortDescription: true } }),
      this.prisma.client.typology.findMany({ where: { developmentId }, select: { id: true, name: true, bedrooms: true, isPenthouse: true } }),
      this.prisma.client.locationPage.findMany({ where: { developmentId }, select: { id: true, name: true, slug: true, published: true, lede: true } }),
      this.prisma.client.post.findMany({ where: { developmentId }, select: { id: true, title: true, slug: true, published: true, excerpt: true } }),
      this.prisma.client.media.findMany({ where: { developmentId, kind: 'IMAGE', archivedAt: null, published: true }, select: { id: true, title: true, altText: true, storageKey: true } }),
      this.prisma.client.videoAsset.findMany({ where: { developmentId, published: true }, select: { id: true, label: true, transcript: true } }),
      this.prisma.client.redirect.findMany({ where: { developmentId, enabled: true }, select: { fromPath: true, toPath: true } }),
    ]);

    const issues: SeoIssue[] = [];
    const titles = new Map<string, string[]>();
    const descriptions = new Map<string, string[]>();

    // The pages that exist whatever the inventory holds.
    for (const route of SEO_ROUTES) {
      const row = seoPages.find((p) => p.path === route.path);
      const title = row?.title ?? site?.title ?? '';
      const description = row?.description ?? site?.description ?? '';
      if (!row?.title) {
        issues.push({
          kind: 'missing-title',
          path: route.path,
          label: route.label,
          severity: site?.title ? 'warning' : 'error',
          detail: site?.title ? 'Falls back to the site-wide title.' : undefined,
        });
      }
      if (!row?.description && !site?.description) issues.push({ kind: 'missing-description', path: route.path, label: route.label, severity: 'error' });
      if (title.length > SEO_TITLE_MAX) issues.push({ kind: 'title-too-long', path: route.path, label: route.label, severity: 'warning', detail: `${title.length} characters` });
      if (description.length > SEO_DESCRIPTION_MAX) issues.push({ kind: 'description-too-long', path: route.path, label: route.label, severity: 'warning', detail: `${description.length} characters` });
      if (!row?.ogImageId) issues.push({ kind: 'missing-og-image', path: route.path, label: route.label, severity: 'warning' });
      if (row?.noindex) issues.push({ kind: 'noindex', path: route.path, label: route.label, severity: 'warning' });
      if (title) titles.set(title, [...(titles.get(title) ?? []), route.path]);
      if (description) descriptions.set(description, [...(descriptions.get(description) ?? []), route.path]);
    }

    // A residence, a type, a location page or an article — the same rules.
    const records: { type: SeoEntityType; id: string; label: string; slug: string; published: boolean; derivable: boolean }[] = [
      ...units.map((u) => ({ type: 'UNIT' as const, id: u.id, label: u.code, slug: residenceSlug(u.code), published: true, derivable: true })),
      ...typologies.map((t) => ({ type: 'TYPOLOGY' as const, id: t.id, label: t.name, slug: residenceTypeKey(t.isPenthouse, t.bedrooms), published: true, derivable: true })),
      ...locations.map((l) => ({ type: 'LOCATION_PAGE' as const, id: l.id, label: l.name, slug: l.slug, published: l.published, derivable: Boolean(l.lede?.trim()) })),
      ...posts.map((p) => ({ type: 'POST' as const, id: p.id, label: p.title, slug: p.slug, published: p.published, derivable: Boolean(p.excerpt?.trim()) })),
    ];
    for (const rec of records) {
      const row = entities.find((e) => e.entityType === rec.type && e.entityId === rec.id);
      const path = seoEntityPath(rec.type, rec.slug);
      if (row?.title) {
        if (row.title.length > SEO_TITLE_MAX) issues.push({ kind: 'title-too-long', path, label: rec.label, severity: 'warning', detail: `${row.title.length} characters` });
        titles.set(row.title, [...(titles.get(row.title) ?? []), path]);
      }
      if (row?.metaDescription) {
        if (row.metaDescription.length > SEO_DESCRIPTION_MAX) issues.push({ kind: 'description-too-long', path, label: rec.label, severity: 'warning', detail: `${row.metaDescription.length} characters` });
        descriptions.set(row.metaDescription, [...(descriptions.get(row.metaDescription) ?? []), path]);
      } else if (!rec.derivable && rec.published) {
        // Nothing written here and nothing to derive from: the page would ship
        // with no description at all.
        issues.push({ kind: 'missing-description', path, label: rec.label, severity: 'error' });
      }
      if (row && !row.robotsIndex && rec.published) issues.push({ kind: 'noindex', path, label: rec.label, severity: 'warning' });
    }

    for (const [title, paths] of titles) if (paths.length > 1) issues.push({ kind: 'duplicate-title', path: paths[0]!, label: title, severity: 'warning', detail: `${paths.length} pages share it` });
    for (const [, paths] of descriptions) if (paths.length > 1) issues.push({ kind: 'duplicate-description', path: paths[0]!, label: 'Shared description', severity: 'warning', detail: paths.slice(0, 6).join(', ') });

    const missingAlt = images.filter((m) => !m.altText?.trim());
    for (const m of missingAlt.slice(0, 50)) issues.push({ kind: 'missing-alt-text', path: '/media', label: m.title ?? m.storageKey.split('/').pop() ?? m.id, severity: 'warning' });
    for (const v of videos.filter((x) => !x.transcript?.trim())) issues.push({ kind: 'missing-transcript', path: '/film', label: v.label, severity: 'warning' });

    const targets = new Set(redirects.map((r) => r.toPath));
    for (const r of redirects) {
      if (r.fromPath === r.toPath || targets.has(r.fromPath)) {
        issues.push({ kind: 'redirect-loop', path: r.fromPath, label: r.fromPath, severity: 'error', detail: `points at ${r.toPath}` });
      }
    }

    const pages = SEO_ROUTES.length + records.filter((r) => r.published).length;
    return {
      score: seoScore(issues, pages),
      counts: {
        pages,
        staticRoutes: SEO_ROUTES.length,
        residences: units.length,
        types: typologies.length,
        locationPages: locations.filter((l) => l.published).length,
        posts: posts.filter((p) => p.published).length,
        images: images.length,
        missingAltText: missingAlt.length,
        redirects: redirects.length,
        withMetadata: entities.length + seoPages.length,
      },
      ready: {
        sitemap: true,
        robots: true,
        structuredData: true,
        siteTitle: Boolean(site?.title),
        siteDescription: Boolean(site?.description),
        searchConsole: Boolean(site?.gscVerification),
        analytics: Boolean(site?.ga4MeasurementId ?? site?.gtmContainerId),
        organization: Boolean(site?.organizationName),
      },
      issues: issues.sort((a, b) => (a.severity === b.severity ? a.kind.localeCompare(b.kind) : a.severity === 'error' ? -1 : 1)),
    };
  }

  /** The records of one kind, in the shape the SEO screens list them. */
  private async records(type: SeoEntityType, developmentId: string): Promise<SeoRecord[]> {
    switch (type) {
      case 'UNIT': {
        const rows = await this.prisma.client.unit.findMany({ where: { developmentId, archivedAt: null }, orderBy: { code: 'asc' }, select: { id: true, code: true, bedrooms: true, areaSqm: true, published: true } });
        return rows.map((u) => ({ id: u.id, label: u.code, slug: residenceSlug(u.code), sub: `${u.bedrooms} bed · ${u.areaSqm} m²`, published: u.published }));
      }
      case 'TYPOLOGY': {
        const rows = await this.prisma.client.typology.findMany({ where: { developmentId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, bedrooms: true, isPenthouse: true, published: true } });
        // The website has no page per typology: it filters /residences by
        // residence type, so that — not the typology's own slug — is the URL.
        return rows.map((t) => ({
          id: t.id,
          label: t.name,
          slug: t.slug,
          path: `/residences?type=${residenceTypeKey(t.isPenthouse, t.bedrooms)}`,
          sub: `${t.bedrooms} bedrooms`,
          published: t.published,
        }));
      }
      case 'LOCATION_PAGE': {
        const rows = await this.prisma.client.locationPage.findMany({ where: { developmentId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, published: true } });
        return rows.map((l) => ({ id: l.id, label: l.name, slug: l.slug, sub: l.published ? 'Published' : 'Draft', published: l.published }));
      }
      case 'POST': {
        const rows = await this.prisma.client.post.findMany({ where: { developmentId }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, slug: true, published: true } });
        return rows.map((p) => ({ id: p.id, label: p.title, slug: p.slug, sub: p.published ? 'Published' : 'Draft', published: p.published }));
      }
      case 'AMENITY': {
        const rows = await this.prisma.client.amenity.findMany({ where: { developmentId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, published: true } });
        return rows.map((a) => ({ id: a.id, label: a.name, slug: a.slug ?? a.id, published: a.published }));
      }
      case 'GALLERY': {
        const rows = await this.prisma.client.gallery.findMany({ where: { developmentId }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, slug: true, published: true } });
        return rows.map((g) => ({ id: g.id, label: g.title, slug: g.slug, published: g.published }));
      }
      case 'FLOOR': {
        const rows = await this.prisma.client.floor.findMany({ where: { building: { developmentId } }, orderBy: { level: 'asc' }, select: { id: true, label: true, level: true, published: true } });
        return rows.map((f) => ({ id: f.id, label: f.label, slug: String(f.level), published: f.published }));
      }
    }
  }
}
