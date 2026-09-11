import { Injectable, Logger } from '@nestjs/common';
import {
  checkNarration,
  deterministicSummary,
  formatMoney,
  parseIntent,
  type ConciergeFilters,
} from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';

/**
 * §9 Phase 5 — the concierge: a deterministic engine plus a narration layer.
 *
 * The order is the whole design. Intent parsing produces structured filters; a
 * real Prisma query returns exact rows; only then is a model allowed to write
 * prose *about that result*. The model receives the result, never the database,
 * and its output is rejected if it contains a digit the result does not.
 */
@Injectable()
export class ConciergeService {
  private readonly log = new Logger(ConciergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ask(devSlug: string, question: string, narrate = false) {
    const filters = parseIntent(question);
    const { units, total, currency } = await this.query(devSlug, filters);

    // Everything the visitor sees as a number comes from here, rendered by the
    // UI from structured data — never from a sentence a model wrote.
    const result = {
      filters,
      matched: units.length,
      total,
      currency,
      priceMinorFrom: units.length ? Math.min(...units.map((u) => u.priceMinor)) : null,
      units: units.slice(0, 12),
    };

    const summary = deterministicSummary({
      matched: result.matched,
      total: result.total,
      priceMinorFrom: result.priceMinorFrom,
      currency,
      formatMoney: (minor, cur) => formatMoney({ amountMinor: minor, currency: cur }),
    });

    if (!narrate) return { ...result, answer: summary, narrated: false };

    const prose = await this.narrate(question, result);
    if (!prose) return { ...result, answer: summary, narrated: false };

    // §9 Phase 5 — "reject any output containing a digit absent from the result
    // set". The allow-list is built from the actual rows.
    const allowed: (string | number)[] = [
      result.matched,
      result.total,
      ...(result.priceMinorFrom !== null ? [Math.round(result.priceMinorFrom / 100)] : []),
      ...result.units.flatMap((u) => [u.code, Math.round(u.priceMinor / 100), u.areaSqm, u.floorLevel]),
      ...filters.bedrooms,
    ];

    const guard = checkNarration(prose, allowed);
    if (!guard.ok) {
      // Not an error to the visitor: they get the correct deterministic answer.
      // It is an error to us, and it is logged as one.
      this.log.error(
        `Concierge narration rejected — invented numbers: ${guard.offendingNumbers.join(', ')}`,
      );
      return { ...result, answer: summary, narrated: false, narrationRejected: true };
    }

    return { ...result, answer: prose, narrated: true };
  }

  /** The exact same query a direct database read would perform (§9 acceptance). */
  private async query(devSlug: string, f: ConciergeFilters) {
    const [rows, total, development] = await Promise.all([
      this.prisma.client.unit.findMany({
        where: {
          floor: {
            building: { development: { slug: devSlug } },
            ...(f.floorMin !== null ? { level: { gte: f.floorMin } } : {}),
          },
          // An unasked question defaults to what a buyer can actually buy.
          status: f.statuses.length ? { in: f.statuses as never[] } : 'AVAILABLE',
          ...(f.bedrooms.length ? { typology: { bedrooms: { in: f.bedrooms } } } : {}),
          ...(f.priceMinorMax !== null ? { priceMinor: { lte: f.priceMinorMax } } : {}),
          ...(f.priceMinorMin !== null ? { priceMinor: { gte: f.priceMinorMin } } : {}),
          ...(f.orientations.length ? { orientation: { in: f.orientations as never[] } } : {}),
          ...(f.viewTags.length ? { viewTags: { hasSome: f.viewTags } } : {}),
          ...(f.areaSqmMin !== null ? { areaSqm: { gte: f.areaSqmMin } } : {}),
        },
        orderBy: { priceMinor: 'asc' },
        select: {
          id: true,
          code: true,
          priceMinor: true,
          currency: true,
          areaSqm: true,
          orientation: true,
          viewTags: true,
          status: true,
          floor: { select: { level: true, label: true } },
          typology: { select: { slug: true, name: true, bedrooms: true } },
        },
      }),
      this.prisma.client.unit.count({
        where: {
          floor: { building: { development: { slug: devSlug } } },
          status: 'AVAILABLE',
        },
      }),
      this.prisma.client.development.findUnique({
        where: { slug: devSlug },
        select: { currency: true },
      }),
    ]);

    return {
      units: rows.map((u) => ({ ...u, floorLevel: u.floor.level })),
      total,
      currency: development?.currency ?? 'USD',
    };
  }

  /**
   * The narration layer. Deliberately the smallest part of this file.
   *
   * The model is given the structured result and told to describe it without
   * numbers; whatever it returns is then checked anyway, because a prompt is a
   * request and the guard is a rule. With no model configured the concierge
   * still works — it just answers deterministically.
   */
  private async narrate(question: string, result: unknown): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.CONCIERGE_MODEL ?? 'claude-sonnet-5',
          max_tokens: 220,
          system:
            'You describe search results for a residential development. Write two sentences at ' +
            'most, in plain British English, in the voice of an architect rather than a brochure. ' +
            'Never state a price, a count, an area, a floor number or a date — the interface ' +
            'renders those from data. Never invent a fact that is not in the result. If the ' +
            'result is empty, say so plainly and suggest which single constraint to relax.',
          messages: [
            {
              role: 'user',
              content: `Question: ${question}\n\nResult: ${JSON.stringify(result)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.log.warn(`Concierge narration unavailable: HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { content?: { text?: string }[] };
      return json.content?.[0]?.text?.trim() ?? null;
    } catch (error) {
      this.log.warn(`Concierge narration failed: ${(error as Error).message}`);
      return null;
    }
  }
}
