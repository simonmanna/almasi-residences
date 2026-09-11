import { Module } from '@nestjs/common';
import { TypologyController } from './typology.controller.js';
import { TypologyService } from './typology.service.js';

@Module({ controllers: [TypologyController], providers: [TypologyService] })
export class TypologyModule {}
