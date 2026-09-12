import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../modules/inventory/inventory.module.js';
import { AuditService } from './audit.service.js';
import { CurrentDevelopment } from './current-development.service.js';
import { PublicSync } from './public-sync.service.js';
import { RevalidateService } from './revalidate.service.js';
import { StorageService } from './storage.service.js';

/** Services every admin and public module shares. */
@Global()
@Module({
  imports: [InventoryModule],
  providers: [CurrentDevelopment, AuditService, StorageService, RevalidateService, PublicSync],
  exports: [CurrentDevelopment, AuditService, StorageService, RevalidateService, PublicSync],
})
export class PlatformCommonModule {}
