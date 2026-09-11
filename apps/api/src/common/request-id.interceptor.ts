import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';

/** §5.2 — every response carries X-Request-Id, and pino logs the same value. */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    return next.handle().pipe(tap(() => void reply.header('X-Request-Id', String(req.id))));
  }
}
