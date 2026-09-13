import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { PublicModule } from '../public/public.module.js';
import { AssetsController } from './assets.controller.js';
import { AuditController } from './audit.controller.js';
import { BuyersController } from './buyers.controller.js';
import { ContentController } from './content.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { EnquiriesController } from './enquiries.controller.js';
import { FloorsController } from './floors.controller.js';
import { GalleriesController } from './galleries.controller.js';
import { ParkingController } from './parking.controller.js';
import { PaymentPlansController } from './payment-plans.controller.js';
import { PresentationController } from './presentation.controller.js';
import { PropertyController } from './property.controller.js';
import { PublishingController } from './publishing.controller.js';
import { ResidencesController } from './residences.controller.js';
import { ResidencesService } from './residences.service.js';
import { ResidentsController } from './residents.controller.js';
import { RoomsController } from './rooms.controller.js';
import { FeaturesController, TypesController } from './types.controller.js';
import { UsersController } from './users.controller.js';

/** The admin platform (D-33): every route under /api/v1/admin except sign-in. */
@Module({
  imports: [AdminModule, PublicModule],
  controllers: [
    DashboardController,
    PropertyController,
    FloorsController,
    ResidencesController,
    RoomsController,
    TypesController,
    FeaturesController,
    ParkingController,
    ResidentsController,
    BuyersController,
    EnquiriesController,
    PaymentPlansController,
    AssetsController,
    GalleriesController,
    ContentController,
    UsersController,
    AuditController,
    PresentationController,
    PublishingController,
  ],
  providers: [ResidencesService],
})
export class PlatformModule {}
