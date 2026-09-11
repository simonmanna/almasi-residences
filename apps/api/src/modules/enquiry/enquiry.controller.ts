import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { NoStore } from '../../common/cache-control.decorator.js';
import { CreateEnquiryDto } from './enquiry.dto.js';
import { EnquiryService } from './enquiry.service.js';

@Controller('enquiry')
export class EnquiryController {
  constructor(private readonly enquiry: EnquiryService) {}

  /** §5.2 — five submissions per ten minutes per IP, tighter than the global limit. */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @NoStore()
  create(@Body() dto: CreateEnquiryDto, @Req() req: FastifyRequest) {
    return this.enquiry.create(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
