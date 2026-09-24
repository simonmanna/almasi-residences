# Almasi Residence — Kimihurura, Kigali

The sales site for Almasi Residence: 28 residences on a quiet rise in
Kimihurura. A cinematic opening, a 3D building you can turn and take apart floor
by floor, live availability from the sales team's own records, a page for every
residence with its plan and payment schedule, a guided tour, and a film.

One building, a fixed inventory, no public accounts. The API and its database are
the single source of truth for every status, price and count on the site.

- Design and technical decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) — D-28
  onwards describe the September 2026 redesign.
- Where every image and film came from, and what is still needed:
  [`docs/ALMASI_MEDIA.md`](docs/ALMASI_MEDIA.md).
- The original specification: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).
- Production on a single VPS: [`docs/DEPLOY.md`](docs/DEPLOY.md).

> Prices and statuses in the seed are illustrative until the sales team sets
> them in the admin. Imagery is CG throughout, labelled on the page.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 24 (see `.nvmrc`) | 20.11+ works |
| pnpm | 9.15.4 | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| Docker | any recent | Must be **running** — Postgres, Redis and MinIO come from compose |

## From a clean checkout to a running site

```bash
pnpm install
cp .env.example .env          # local defaults work as-is
pnpm infra:up                 # postgres+postgis, redis, minio
pnpm db:generate              # prisma client
pnpm --filter @avida/db migrate:deploy
pnpm db:seed                  # Almasi: 28 residences, 5 typologies, amenities, landmarks
pnpm dev                      # web, api, admin, worker
```

Then open <http://localhost:3000>.

| App | Port | What it is |
|---|---|---|
| web | 3000 | The public site (Next.js 16) |
| api | `API_PORT` (3001) | Public + admin API (NestJS, base path `/api/v1`) |
| admin | 3002 | Sales team admin — change a status here and the site follows within a minute |
| worker | — | Media pipeline queues |

The web app reads the repository's single `.env` itself and proxies `/api/v1/*`
to the API, so browsers never call the API origin directly.

### A second web server beside `pnpm dev`

```bash
node scripts/dev-preview.mjs          # http://localhost:3100, its own .next-preview build dir
```

## The site

| Route | What it is |
|---|---|
| `/` | Opening sequence, the 3D building, residences, the scroll-driven experience, amenities, location, penthouses, payment plan, film, gallery, enquiry |
| `/residences` | Every residence, filterable by type, bedrooms, floor, size, price and status — as a list, an elevation or the 3D building. Filters live in the URL |
| `/residences/[code]` | One page per residence (`/residences/e2`, `/residences/ph-c`): spaces, plan and position, specification, its own payment schedule, enquiry |
| `/tour`, `/tour/penthouse` | The guided tours |
| `/film` | The film with chapters; downloadable |
| `/amenities`, `/location`, `/gallery`, `/buying`, `/enquire`, `/progress` | As named |

Old URLs (`/availability`, `/residences/<typology>`, `?ui=`) redirect — see `apps/web/proxy.ts`.

## Media

```bash
node scripts/media/build-almasi-media.mjs <masters-dir>                        # stills, clips, blur placeholders, OG image
node scripts/media/render-almasi-film.mjs .claude/skills/ui-styling/canvas-fonts   # the film and its chapters
```

Both write into `apps/web/public/media/almasi` and `apps/web/lib/*.json`. ffmpeg
comes from the worker's Docker image when it is not installed locally.

## Everyday commands

```bash
pnpm dev                 # everything, watched
pnpm build               # every app
pnpm test                # unit tests
pnpm typecheck
pnpm db:reset            # drop, migrate, reseed  (destroys local data)
pnpm check:env           # .env.example matches what the code reads
pnpm check:secrets       # nothing secret exposed to a client bundle
pnpm infra:down          # stop the containers
```

## House rules

- **Availability has one source.** Every count, status and price on the site is
  derived from the API's inventory in `apps/web/lib/residences.ts` and shared
  through `InventoryProvider`, which polls the API's live endpoint. Nothing in
  the web app stores a status or a count.
- **Colour comes from tokens only.** `apps/web/styles/tokens.css` defines two
  grounds, stone and night; `tests/tokens.contrast.test.ts` holds both to the
  contrast floor.
- **No `text-transform: uppercase`.** Lockups use small capitals
  (`font-variant-caps`), so the source text stays sentence case.
- **Money is an integer in minor units**, formatted through `@avida/types`.
- **A price is only shown for a residence that can be bought.**
- **Every CG image carries its provenance note** beside it.
- **Everything moves only if the visitor allows it.** Each animated piece checks
  `prefers-reduced-motion` and has a static equivalent.
