import 'reflect-metadata';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { RedisService } from './common/redis.service.js';
import { RequestIdInterceptor } from './common/request-id.interceptor.js';

async function bootstrap() {
  // Refuse to start in production without the shared state the security
  // controls depend on, rather than degrading quietly.
  RedisService.assertReady();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, genReqId: () => crypto.randomUUID() }),
    // Nest's own JSON parser is replaced by the tolerant one below.
    { bufferLogs: true, bodyParser: false },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');

  // Fastify refuses an empty body sent as application/json. Browsers' fetch
  // wrappers commonly send that header on a bodiless POST (archive, restore)
  // or DELETE, so an empty body parses as {} instead of failing with a 400.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      const error = Object.assign(new Error('The request body is not valid JSON.'), { statusCode: 400 });
      done(error, undefined);
    }
  });

  // §5.2 — reject anything not on the DTO rather than silently accepting it.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // §5.9 — security headers. This API only ever answers with JSON or a file,
  // so nothing it returns should be allowed to load or run anything: the policy
  // below is `default-src 'none'` with the frame and form directives closed.
  // /files responses override it with their own sandbox policy, and the web app
  // sets its own for the HTML it serves.
  //
  // Cross-origin resource policy stays relaxed so the admin, on another origin,
  // can display uploaded images.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'none'"],
        'base-uri': ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // §15 — uploads stream through multipart; per-kind size limits are checked
  // again by StorageService, this is only the hard ceiling.
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 30, fields: 30 } });

  // §5.2 — the web and admin origins only. No wildcard, ever.
  app.enableCors({
    origin: [
      process.env.WEB_ORIGIN ?? 'http://localhost:3000',
      process.env.ADMIN_ORIGIN ?? 'http://localhost:3002',
    ],
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`api listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
