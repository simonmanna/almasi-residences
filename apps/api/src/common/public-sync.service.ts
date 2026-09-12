import { Injectable } from '@nestjs/common';
import { InventoryService } from '../modules/inventory/inventory.service.js';
import { CurrentDevelopment } from './current-development.service.js';
import { RevalidateService } from './revalidate.service.js';

export type SyncScope = 'inventory' | 'content' | 'media' | 'all';

/** Which public pages read what. Dynamic segments are sent as the route pattern. */
const PATHS: Record<SyncScope, string[]> = {
  inventory: ['/', '/residences', '/residences/[code]', '/buying', '/sitemap.xml'],
  content: ['/', '/amenities', '/buying', '/gallery', '/location', '/enquire', '/residences/[code]'],
  media: ['/', '/gallery', '/amenities', '/residences/[code]'],
  all: ['/', '/residences', '/residences/[code]', '/amenities', '/buying', '/gallery', '/location', '/enquire', '/progress', '/sitemap.xml'],
};

/**
 * §37 — Admin → database → cache invalidation → public site. Every admin write
 * that a visitor could see calls `changed()` after it commits: the API's own
 * inventory cache is dropped at once, and Next is asked to rebuild the pages
 * that read the data. Nothing here can fail the write that triggered it.
 */
@Injectable()
export class PublicSync {
  constructor(
    private readonly inventory: InventoryService,
    private readonly revalidate: RevalidateService,
    private readonly dev: CurrentDevelopment,
  ) {}

  async changed(scope: SyncScope = 'all'): Promise<void> {
    const { slug } = await this.dev.get();
    if (scope === 'inventory' || scope === 'all') await this.inventory.bustCache(slug);
    void this.revalidate.paths(slug, PATHS[scope]);
  }
}
