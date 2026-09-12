import { Module } from '@nestjs/common';
import { FilesController } from '../files/files.controller.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';

@Module({
  controllers: [PublicController, FilesController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
