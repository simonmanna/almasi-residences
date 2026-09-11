import { Module } from '@nestjs/common';
import { ConciergeController } from './concierge.controller.js';
import { ConciergeService } from './concierge.service.js';

@Module({ controllers: [ConciergeController], providers: [ConciergeService] })
export class ConciergeModule {}
