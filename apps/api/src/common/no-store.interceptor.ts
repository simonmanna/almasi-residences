import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';

/**
 * Applies `Cache-Control: no-store` to every route on a controller. The
 * `@Header()` decorator only works per method, and the whole admin API must be
 * uncacheable — one forgotten method is a cached page of customer data in a
 * shared proxy.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    void reply.header('Cache-Control', 'no-store');
    return next.handle().pipe(tap(() => undefined));
  }
}
