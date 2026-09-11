import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './modules/admin/admin.module.js';
import { ConciergeModule } from './modules/concierge/concierge.module.js';
import { DevelopmentModule } from './modules/development/development.module.js';
import { EnquiryModule } from './modules/enquiry/enquiry.module.js';
import { LocationModule } from './modules/location/location.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { TourModule } from './modules/tour/tour.module.js';
import { TypologyModule } from './modules/typology/typology.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { PrismaModule } from './common/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    LoggerModule.forRoot({
      pinoHttp: {
        // §5.9 — enquiry PII must never reach a log line, at any level.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.email',
            'req.body.phone',
            'req.body.name',
            'req.body.message',
          ],
          censor: '[redacted]',
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        customProps: (req) => ({ requestId: req.id }),
      },
    }),
    // §5.2 — 120 req/min per IP globally. /enquiry tightens this in Phase 1.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    DevelopmentModule,
    InventoryModule,
    PricingModule,
    TypologyModule,
    LocationModule,
    EnquiryModule,
    AdminModule,
    MediaModule,
    TourModule,
    ConciergeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
