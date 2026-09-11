import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { RequestIdInterceptor } from './common/request-id.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, genReqId: () => crypto.randomUUID() }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');

  // §5.2 — reject anything not on the DTO rather than silently accepting it.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // §5.9 — security headers. CSP is set by the web app, which serves the HTML.
  await app.register(helmet, { contentSecurityPolicy: false });

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
