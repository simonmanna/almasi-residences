import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** §5.2 — errors are RFC 7807 problem+json, not ad-hoc shapes. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly log = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // An unexpected error must reach the log with its stack. Returning a bare
    // "An unexpected error occurred" to the client and nothing to the operator
    // makes a 500 undiagnosable.
    if (!(exception instanceof HttpException)) {
      const e = exception as Error;
      this.log.error(`Unhandled ${e?.name ?? 'error'} on ${req.method} ${req.url}: ${e?.message}`, e?.stack);
    }

    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const detail =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : 'An unexpected error occurred.';

    void reply.status(status).type('application/problem+json').send({
      type: `https://httpstatuses.io/${status}`,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail,
      instance: req.url,
      requestId: req.id,
    });
  }
}
