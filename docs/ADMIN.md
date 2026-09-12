# Almasi admin platform

The developer's command centre. The admin database is the single source of
truth; the public site renders what the API returns (DECISIONS D-33).

## Run it locally

```bash
pnpm infra:up          # Postgres on 5433, Redis on 6380 (see infra/docker-compose.yml)
pnpm db:migrate        # or: cd packages/db && npx prisma migrate deploy
pnpm db:seed           # first state only — never overwrites admin edits
pnpm media:import      # once: moves the site's renders into the media library
pnpm dev               # api :3011 · admin :3002 · web :3000
```

Sign in at <http://localhost:3002>. Local seed accounts (development only;
password is `SEED_ADMIN_PASSWORD` in `.env`, no authenticator code):

| Email | Role |
|---|---|
| owner@example.invalid | Super admin |
| property@example.invalid | Property manager |
| sales@example.invalid | Sales manager |
| content@example.invalid | Content manager |
| viewer@example.invalid | Viewer |

Production accounts are created with `apps/api/scripts/create-admin.mjs`
(password and TOTP secret); production refuses a sign-in without TOTP.

## Where things live

| Concern | Code |
|---|---|
| Schema & migration | `packages/db/prisma/schema.prisma`, `migrations/20260911120000_admin_platform` |
| Roles, permissions, statuses, CMS fields | `packages/types/src/admin.ts`, `inventory.ts` |
| Admin API (every route under `/api/v1/admin`) | `apps/api/src/modules/platform/*` |
| Public API (`/api/v1/property`, `/floors`, `/residences`, `/amenities`, `/galleries`, `/media`, `/parking`, `/payment-plans`, `/pages`, `/faqs`) | `apps/api/src/modules/public/*` |
| Uploads, WebP renditions, file serving | `apps/api/src/common/storage.service.ts`, `modules/files` |
| Audit log, cache invalidation, revalidation | `apps/api/src/common/audit.service.ts`, `public-sync.service.ts` |
| Admin UI | `apps/admin/src` (screens in `pages/`, shared pieces in `components/`) |

## How a change reaches the website

Admin save → API validates and writes → audit row → `PublicSync` drops the
inventory cache and POSTs `WEB_REVALIDATE_URL` with the affected routes → Next
re-renders them. The site's `/inventory/live` poll (every 60 s) is the backstop
for status and price.

## Environment

`STORAGE_DRIVER` (`local` or `s3`), `MEDIA_STORAGE_DIR` (local driver),
`VITE_SITE_URL` (admin's "View on website" links) and `DEVELOPMENT_SLUG` are
listed in `.env.example`. Uploaded files are under `storage/` locally and are
not committed.
