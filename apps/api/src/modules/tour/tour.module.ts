import { Module } from '@nestjs/common';
import { TourController } from './tour.controller.js';

@Module({ controllers: [TourController] })
export class TourModule {}
