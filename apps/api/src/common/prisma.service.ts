import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { prisma, type PrismaClient } from '@avida/db';

/**
 * Wraps the shared singleton from @avida/db so Nest can inject it, without
 * creating a second connection pool alongside the one the package owns.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
