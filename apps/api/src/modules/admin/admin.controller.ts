import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, Roles, type AdminRequest } from './admin.guard.js';
import { BulkStatusDto, LoginDto, UpdateEnquiryDto, UpdateUnitDto } from './admin.dto.js';
import { AdminService } from './admin.service.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const COOKIE_ATTRS = 'Path=/; HttpOnly; SameSite=Strict';

@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly admin: AdminService,
    private readonly sessions: SessionService,
  ) {}

  /** §5.9 — five attempts per fifteen minutes per IP; per-account lock is in AuthService. */
  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const { token, user } = await this.auth.login(dto.email, dto.password, dto.totp);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    void reply.header('set-cookie', `${SESSION_COOKIE}=${token}; ${COOKIE_ATTRS}${secure}`);
    return { user };
  }

  @Post('auth/logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    void reply.header('set-cookie', `${SESSION_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: AdminRequest) {
    return this.auth.me(req.admin!.userId);
  }

  @Get('dashboard')
  @UseGuards(AdminGuard)
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('units')
  @UseGuards(AdminGuard)
  units(
    @Query('status') status?: string,
    @Query('typology') typology?: string,
    @Query('q') q?: string,
  ) {
    return this.admin.listUnits({ status, typology, q });
  }

  @Patch('units/:id')
  @UseGuards(AdminGuard)
  async updateUnit(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: AdminRequest,
  ) {
    if (dto.status) {
      await this.admin.changeStatus({
        unitIds: [id],
        status: dto.status,
        actorId: req.admin!.userId,
        actorRole: req.admin!.role,
      });
    }
    if (dto.priceMinor !== undefined || dto.notes !== undefined) {
      return this.admin.updateUnit(
        id,
        { priceMinor: dto.priceMinor, notes: dto.notes },
        req.admin!.userId,
      );
    }
    return { ok: true };
  }

  /** §5.4 — the daily action: flip a set of units in one go. */
  @Post('units/bulk-status')
  @UseGuards(AdminGuard)
  bulkStatus(@Body() dto: BulkStatusDto, @Req() req: AdminRequest) {
    return this.admin.changeStatus({
      unitIds: dto.ids,
      status: dto.status,
      actorId: req.admin!.userId,
      actorRole: req.admin!.role,
    });
  }

  @Get('units/:id/history')
  @UseGuards(AdminGuard)
  history(@Param('id') id: string) {
    return this.admin.unitHistory(id);
  }

  @Get('enquiries')
  @UseGuards(AdminGuard)
  enquiries(@Query('status') status?: string) {
    return this.admin.listEnquiries({ status });
  }

  @Patch('enquiries/:id')
  @UseGuards(AdminGuard)
  updateEnquiry(@Param('id') id: string, @Body() dto: UpdateEnquiryDto) {
    return this.admin.updateEnquiry(id, dto);
  }

  @Get('enquiries/export.csv')
  @UseGuards(AdminGuard)
  // §5.9 — the schema's roles are OWNER, MARKETING, SALES. Bulk export of the
  // customer list is limited to the first two; SALES reads the inbox in the app
  // but cannot walk out with every lead's contact details in one file.
  @Roles('OWNER', 'MARKETING')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="enquiries.csv"')
  exportCsv(@Req() req: AdminRequest) {
    return this.admin.exportEnquiriesCsv(req.admin!.userId, req.ip);
  }
}
