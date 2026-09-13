import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * The admin manages one property. Which one is fixed by DEVELOPMENT_SLUG (or
 * NEXT_PUBLIC_DEVELOPMENT_SLUG); without either, the only development in the
 * database. Resolved once per process — a property is never renamed under us
 * because the slug is not editable in the admin.
 */
@Injectable()
export class CurrentDevelopment {
  private cached: { id: string; slug: string; name: string; currency: string } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<{ id: string; slug: string; name: string; currency: string }> {
    if (this.cached) return this.cached;
    const slug = process.env.DEVELOPMENT_SLUG || process.env.NEXT_PUBLIC_DEVELOPMENT_SLUG;
    const dev = slug
      ? await this.prisma.client.development.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, currency: true } })
      : await this.prisma.client.development.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, slug: true, name: true, currency: true } });
    if (!dev) throw new NotFoundException('No property is configured. Run `pnpm db:seed`.');
    this.cached = dev;
    return dev;
  }

  /**
   * Called after any write to the Development row, so a currency or name change
   * is read at once rather than after a restart (audit §2).
   */
  invalidate(): void {
    this.cached = null;
  }

  async id(): Promise<string> {
    return (await this.get()).id;
  }
}
