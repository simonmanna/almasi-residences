import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';

/**
 * §40.2 — preview before publishing.
 *
 * The admin issues a short-lived signed token; the website's Draft Mode sends it
 * back on every API read as `x-preview-token`. Within that request, public reads
 * include unpublished records and page drafts. Archived records never show, and
 * without a valid token nothing changes: a visitor cannot ask for drafts.
 *
 * Stateless (HMAC) so no table and no Redis round-trip sits on the public read path.
 */

const store = new AsyncLocalStorage<{ preview: boolean }>();
const TTL_SECONDS = 60 * 60;

function secret(): string {
  const s = process.env.PREVIEW_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('PREVIEW_SECRET (or ADMIN_SESSION_SECRET) must be at least 32 characters');
  return s;
}

const sign = (payload: string) => createHmac('sha256', `preview:${secret()}`).update(payload).digest('base64url');

export function issuePreviewToken(actorId: string, ttlSeconds = TTL_SECONDS): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ sub: actorId, exp })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPreviewToken(token: string | null | undefined): { sub: string; exp: number } | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
    if (typeof body.sub !== 'string' || typeof body.exp !== 'number' || body.exp < Date.now() / 1000) return null;
    return { sub: body.sub, exp: body.exp };
  } catch {
    return null;
  }
}

/** True while serving a request that carries a valid preview token. */
export const previewing = (): boolean => store.getStore()?.preview === true;

/** `published: true`, except in a preview, where drafts show too. */
export const shown = (): { published?: true } => (previewing() ? {} : { published: true });

/** Shown, and never archived — for every model that can be archived. */
export const live = (): { published?: true; archivedAt: null } => ({ ...shown(), archivedAt: null });

/** Runs a public controller's handlers inside the preview context of their request. */
@Injectable()
export class PreviewInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers['x-preview-token'];
    const preview = verifyPreviewToken(Array.isArray(header) ? header[0] : header) !== null;
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    void reply.header('Vary', 'x-preview-token');
    return new Observable((subscriber) =>
      store.run({ preview }, () =>
        next
          .handle()
          // A preview response carries drafts: never let a proxy keep it.
          .pipe(tap(() => preview && void reply.header('Cache-Control', 'private, no-store')))
          .subscribe(subscriber),
      ),
    );
  }
}
