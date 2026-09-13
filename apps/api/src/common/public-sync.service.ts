import { Injectable } from '@nestjs/common';
import { SCOPE_TAGS, type SyncScope } from '@avida/types';
import { InventoryService } from '../modules/inventory/inventory.service.js';
import { CurrentDevelopment } from './current-development.service.js';
import { RevalidateService } from './revalidate.service.js';

export type { SyncScope };

/**
 * §37 — Admin → database → cache invalidation → public site. Every admin write
 * that a visitor could see calls `changed()` after it commits: the API's own
 * inventory cache is dropped at once, and the website is told which cache tags
 * the change touched (SCOPE_TAGS). Delivery is recorded and retried by
 * RevalidateService; nothing here can fail the write that triggered it.
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
    if (scope === 'inventory' || scope === 'content' || scope === 'media' || scope === 'all') await this.inventory.bustCache(slug);
    await this.revalidate.tags(slug, scope, SCOPE_TAGS[scope]);
  }
}
