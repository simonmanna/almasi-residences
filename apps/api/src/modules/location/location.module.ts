import { Module } from '@nestjs/common';
import { LocationController } from './location.controller.js';

@Module({ controllers: [LocationController] })
export class LocationModule {}
