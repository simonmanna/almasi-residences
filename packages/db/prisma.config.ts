import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The workspace keeps one .env at the repo root; the CLI runs with this
// package as its working directory.
loadEnv({ path: resolve(process.cwd(), '../../.env') });

/**
 * Prisma 7 config. The CLI reads the connection string here; the application
 * gets it through the pg driver adapter in src/index.ts (see DECISIONS D-02).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
