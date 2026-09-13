import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@avida/db';
import { ANALYTICS_EVENTS } from '@avida/types';
import { NoStore } from '../../common/cache-control.decorator.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { PrismaService } from '../../common/prisma.service.js';

class EventDto {
  @IsIn(ANALYTICS_EVENTS) name!: string;
  @IsOptional() @IsString() @MaxLength(300) path?: string;
  /** A residence code ("A2") — resolved here, so the website never needs internal ids. */
  @IsOptional() @IsString() @MaxLength(16) residence?: string;
  @IsOptional() @IsObject() props?: Record<string, unknown>;
}

class EventsDto {
  /** Random per-tab id from sessionStorage. Not a cookie, not a person. */
  @Matches(/^[A-Za-z0-9_-]{8,64}$/) sessionId!: string;
  @IsArray() @ArrayMaxSize(25) @ValidateNested({ each: true }) @Type(() => EventDto) events!: EventDto[];
  @IsOptional() @IsString() @MaxLength(300) referrer?: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string;
}

/** Props are kept small and flat: a string, number or boolean each, at most twelve. */
function cleanProps(props: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props).slice(0, 12)) {
    if (!/^[a-zA-Z_]{1,32}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Roadmap item 40 — the website's funnel, measured first-party.
 *
 * Cookieless and anonymous: no IP address, no user agent string, no personal
 * data — a random session id from the tab, the page, the event and (for a
 * residence) its code. That is enough to answer the brief's questions (which
 * residences attract attention, which convert, where visitors drop off) with
 * no consent banner and no third party.
 */
@Controller('events')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
  ) {}

  @Post()
  @HttpCode(202)
  @NoStore()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async ingest(@Body() dto: EventsDto, @Req() req: FastifyRequest) {
    // Bots and previews are not visitors.
    const ua = String(req.headers['user-agent'] ?? '');
    if (/bot|crawl|spider|headless|lighthouse/i.test(ua) || req.headers['x-preview-token']) return { accepted: 0 };
    const developmentId = await this.dev.id();
    const codes = [...new Set(dto.events.map((e) => e.residence?.toUpperCase()).filter((c): c is string => Boolean(c)))];
    const units = codes.length ? await this.prisma.client.unit.findMany({ where: { developmentId, code: { in: codes, mode: 'insensitive' } }, select: { id: true, code: true } }) : [];
    const byCode = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));
    const device = /mobile|iphone|android/i.test(ua) ? 'mobile' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop';
    const referrer = dto.referrer ? safeHost(dto.referrer) : null;

    const { count } = await this.prisma.client.analyticsEvent.createMany({
      data: dto.events.map((e) => ({
        developmentId,
        name: e.name,
        sessionId: dto.sessionId,
        path: e.path?.split('?')[0] ?? null,
        unitId: e.residence ? (byCode.get(e.residence.toUpperCase()) ?? null) : null,
        props: cleanProps(e.props),
        referrer,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        device,
      })),
    });
    return { accepted: count };
  }
}

/** Only the referring site, never the full URL (which can carry search terms or ids). */
function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, '').slice(0, 120);
  } catch {
    return null;
  }
}
