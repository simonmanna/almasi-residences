import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../modules/inventory/inventory.module.js';
import { AccessService } from './access.service.js';
import { AuditService } from './audit.service.js';
import { CrmService } from './crm.service.js';
import { CurrentDevelopment } from './current-development.service.js';
import { NotificationService } from './notification.service.js';
import { PublicSync } from './public-sync.service.js';
import { RevalidateService } from './revalidate.service.js';
import { StorageService } from './storage.service.js';

/** Services every admin and public module shares. */
@Global()
@Module({
  imports: [InventoryModule],
  providers: [AccessService, CurrentDevelopment, AuditService, StorageService, RevalidateService, PublicSync, NotificationService, CrmService],
  exports: [AccessService, CurrentDevelopment, AuditService, StorageService, RevalidateService, PublicSync, NotificationService, CrmService],
})
export class PlatformCommonModule {}
