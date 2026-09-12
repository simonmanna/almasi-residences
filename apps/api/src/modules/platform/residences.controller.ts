import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { UnitStatus } from '@avida/types';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { PublicService } from '../public/public.service.js';
import { actorOf } from './actor.js';
import {
  BulkResidenceDto,
  CreateResidenceDto,
  DuplicateResidenceDto,
  ResidencePricingDto,
  StatusChangeDto,
  UpdateResidenceDto,
} from './dto.js';
import { ResidencesService, type ResidenceQuery } from './residences.service.js';

@Controller('admin/residences')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class ResidencesController {
  constructor(
    private readonly residences: ResidencesService,
    private readonly publicApi: PublicService,
  ) {}

  @Get()
  list(@Query() q: ResidenceQuery, @Req() req: AdminRequest) {
    return this.residences.list(q, actorOf(req));
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="residences.csv"')
  export(@Query() q: ResidenceQuery, @Req() req: AdminRequest) {
    return this.residences.exportCsv(q, actorOf(req), req);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.residences.get(id, actorOf(req));
  }

  /** §38 — exactly what a visitor would see, published or not. */
  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    return this.publicApi.residenceById(id, { includeUnpublished: true });
  }

  @Post()
  @RequirePermission('residence.edit')
  create(@Body() dto: CreateResidenceDto, @Req() req: AdminRequest) {
    return this.residences.create(dto, actorOf(req), req);
  }

  @Patch(':id')
  @RequirePermission('residence.edit')
  update(@Param('id') id: string, @Body() dto: UpdateResidenceDto, @Req() req: AdminRequest) {
    return this.residences.update(id, dto, actorOf(req), req);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('residence.status')
  status(@Param('id') id: string, @Body() dto: StatusChangeDto, @Req() req: AdminRequest) {
    return this.residences.changeStatus([id], dto.status as UnitStatus, dto.note, actorOf(req), req);
  }

  @Post(':id/price')
  @HttpCode(200)
  @RequirePermission('residence.price')
  price(@Param('id') id: string, @Body() dto: ResidencePricingDto, @Req() req: AdminRequest) {
    return this.residences.changePrice(id, dto, actorOf(req), req);
  }

  /** Each action checks its own permission inside the service. */
  @Post('bulk')
  @HttpCode(200)
  bulk(@Body() dto: BulkResidenceDto, @Req() req: AdminRequest) {
    return this.residences.bulk(dto, actorOf(req), req);
  }

  @Post(':id/duplicate')
  @RequirePermission('residence.edit')
  duplicate(@Param('id') id: string, @Body() dto: DuplicateResidenceDto, @Req() req: AdminRequest) {
    return this.residences.duplicate(id, dto, actorOf(req), req);
  }

  @Put(':id/features')
  @RequirePermission('residence.edit')
  features(@Param('id') id: string, @Body() dto: UpdateResidenceDto, @Req() req: AdminRequest) {
    return this.residences.update(id, { featureIds: dto.featureIds ?? [] }, actorOf(req), req);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('residence.delete')
  archive(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.residences.archive(id, actorOf(req), req);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('residence.delete')
  restore(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.residences.restore(id, actorOf(req), req);
  }

  @Delete(':id')
  @RequirePermission('residence.delete')
  remove(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.residences.remove(id, actorOf(req), req);
  }
}
