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
(password and TOTP secret; `--no-totp` for password only).

## Signing in

- **Email + password.** An account with an authenticator must also enter its
  code. With `ADMIN_REQUIRE_TOTP=true` every password sign-in needs one.
- **Continue with Google.** Shown when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set. Google proves the email; it still has to
  belong to an active user under Users. Create an OAuth client (Web
  application) at console.cloud.google.com with the authorised redirect URI
  `https://admin.<domain>/api/v1/admin/auth/google/callback`
  (locally `http://localhost:<API_PORT>/api/v1/admin/auth/google/callback`).

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
