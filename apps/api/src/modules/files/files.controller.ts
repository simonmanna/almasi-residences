import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CONTENT_TYPE, StorageService } from '../../common/storage.service.js';

/**
 * Serves uploaded media from the local storage driver. In production the files
 * live in R2 behind its own CDN and this route is never linked to.
 *
 * Keys are content-addressed (a new upload gets a new key), so responses are
 * immutable. An uploaded SVG or PDF is served under a sandboxing CSP, so a
 * script inside one can never run on the API's origin.
 *
 * Exempt from the global 120/min throttle (§5.2): one gallery page asks for
 * twenty or thirty renditions at once, so a visitor would spend the whole API
 * budget on their own pictures and watch most of them fail with a 429. These
 * are immutable static bytes off disk, cached for a year — nothing to protect.
 */
@SkipThrottle()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  async serve(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const raw = (req.params as Record<string, string>)['*'] ?? '';
    const key = decodeURIComponent(raw);
    if (!/^media\/[\w/.-]+$/.test(key) || key.includes('..')) throw new NotFoundException();

    const file = await this.storage.openLocal(key);
    if (!file) throw new NotFoundException('No such file');

    const ext = key.split('.').pop()!.toLowerCase();
    return reply
      .header('Content-Type', CONTENT_TYPE[ext] ?? 'application/octet-stream')
      .header('Content-Length', file.size)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
      .send(file.stream);
  }
}
