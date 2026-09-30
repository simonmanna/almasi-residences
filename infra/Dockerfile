# syntax=docker/dockerfile:1.7
#
# One recipe for the single-VPS deploy (docs/DEPLOY.md). Build context is the
# repo root. Targets:
#   api     NestJS API, production dependencies only
#   worker  media pipeline, with ffmpeg, production dependencies only
#   web     Next.js public site (standalone server output)
#   caddy   TLS proxy, serving the admin SPA as static files
#   tools   the whole built workspace: migrations, seed, create-admin
#
# The workspace is built whole; the runtime images then carry only what their
# app needs (`pnpm deploy --prod`, Next standalone). Anything that needs the
# Prisma CLI or tsx runs from `tools`.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ─── dependencies: only manifests, so code edits don't reinstall ──────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ─── shared build: packages + api + worker ────────────────────────────────
FROM deps AS build
COPY . .
# prisma.config.ts reads DATABASE_URL; generate never connects.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm turbo run build --filter=@avida/api --filter=@avida/worker

# Each app with only its production dependencies; workspace packages are
# copied in by their `files` lists (packages/db ships dist + generated client).
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@avida/api deploy --prod /out/api \
 && pnpm --filter=@avida/worker deploy --prod /out/worker

# Migrations, seed and create-admin: the full workspace, dev tools included.
FROM build AS tools
# The Prisma CLI probes for libssl.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/api

FROM base AS api
COPY --from=pruned /out/api /app/apps/api
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]

# ffmpeg sits in its own layer so a code change doesn't re-download it.
FROM base AS media-base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

FROM media-base AS worker
COPY --from=pruned /out/worker /app/apps/worker
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]

# ─── web: NEXT_PUBLIC_* are inlined at build time ─────────────────────────
FROM build AS web-build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MEDIA_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_UI_MODE_DEFAULT=multi
ARG NEXT_PUBLIC_LOCALE=en-GB
ARG NEXT_PUBLIC_DEVELOPMENT_SLUG=almasi-residences
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=
ARG NEXT_PUBLIC_UMAMI_ID=
# §6.7 — the build pre-renders typology pages from live inventory, so the API
# must answer during the build. Compose builds on the host network for this.
ARG API_INTERNAL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_UI_MODE_DEFAULT=$NEXT_PUBLIC_UI_MODE_DEFAULT \
    NEXT_PUBLIC_LOCALE=$NEXT_PUBLIC_LOCALE \
    NEXT_PUBLIC_DEVELOPMENT_SLUG=$NEXT_PUBLIC_DEVELOPMENT_SLUG \
    NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL \
    NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_UMAMI_ID=$NEXT_PUBLIC_UMAMI_ID \
    API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm turbo run build --filter=@avida/web

# Standalone output: the traced server plus the static assets it expects
# beside it. Same /app/apps/web layout, so the image-cache volume still fits.
FROM base AS web
ENV NODE_ENV=production     HOSTNAME=0.0.0.0     PORT=3000
COPY --from=web-build /app/apps/web/.next/standalone /app
COPY --from=web-build /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=web-build /app/apps/web/public /app/apps/web/public
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]

# ─── admin SPA, baked into the proxy image ────────────────────────────────
FROM build AS admin-build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@avida/admin

FROM caddy:2-alpine AS caddy
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=admin-build /app/apps/admin/dist /srv/admin
