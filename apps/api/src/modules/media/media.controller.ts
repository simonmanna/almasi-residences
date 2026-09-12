import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, RequirePermission } from '../admin/admin.guard.js';
import { CompleteUploadDto, UploadUrlDto } from './media.dto.js';
import { MediaService } from './media.service.js';

/** §5.4 — the time-state render pipeline (presigned upload → worker). Media editors only. */
@Controller('admin/media')
@UseGuards(AdminGuard)
@RequirePermission('media.edit')
@UseInterceptors(NoStoreInterceptor)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  uploadUrl(@Body() dto: UploadUrlDto) {
    return this.media.createUploadUrl(dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() _dto: CompleteUploadDto) {
    return this.media.completeUpload(id);
  }

  /** §9 Phase 2 task 8 — which sets are missing which time states. */
  @Get('sets')
  sets() {
    return this.media.board();
  }

  @Get('jobs')
  jobs() {
    return this.media.jobs();
  }
}
