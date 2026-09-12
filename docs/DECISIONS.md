# Decisions

Every choice the specification left open, and why it went the way it did.
One entry per decision. Amend an entry when a decision changes; never delete it —
the reasoning is the point.

Referenced sections (§) are in `IMPLEMENTATION_PLAN.md` v1.1.

---

## D-01 — Dependency versions resolved at scaffold, not taken from the spec

**Status:** decided, 2026-09-09 · **§3.1 version policy**

The spec named majors chosen in 2025 as *floors*. Resolved at scaffold time:

| Package | Spec floor | Installed | Note |
|---|---|---|---|
| Next.js | 15 | **16.3.4** | See D-09 for the file-convention change it forced |
| React | — | **19.3.0** | |
| NestJS | 10 | **11.1.6** | 12.0.1 exists but `@nestjs/cli`, `nestjs-pino` and `@nestjs/throttler` had not all published matching majors; revisit in Phase 1 |
| Prisma | 5 | **7.10.0** | 8.x is release-candidate only. See D-02 |
| Tailwind | v4 | **not yet installed** | Phase 0 needs tokens, not utilities. See D-06 |
| TypeScript | — | **5.9.3** | 7.0.2 is stable but the Nest decorator toolchain and eslint plugins are not proven on it. Revisit in Phase 1 |
| Turborepo | — | **2.10.12** | |
| pnpm | — | **9.15.4** | pinned via `packageManager` |

`fastify` is pinned to **5.12.3** through a pnpm override: `@nestjs/platform-fastify`
wants 5.4.x and `@fastify/helmet`'s types want 5.12.x, and two copies of
`FastifyInstance` do not unify.

## D-02 — Prisma 7: driver adapter instead of a datasource URL

**Status:** decided, 2026-09-09 · **§4.1**

Prisma 7 removed `url` from the `datasource` block. The connection now comes from
`@prisma/adapter-pg` at runtime (`packages/db/src/index.ts`) and from
`packages/db/prisma.config.ts` for the CLI. `@prisma/client-runtime-utils` is an
explicit dependency because pnpm's strict layout does not hoist it.

The schema declares all four extensions the `postgis/postgis` image installs
(`postgis`, `postgis_topology`, `postgis_tiger_geocoder`, `fuzzystrmatch`).
Declaring only `postgis` makes every `migrate dev` report drift.

## D-03 — Env loading lives in `@avida/db`

**Status:** decided, 2026-09-09

One `.env` at the repo root. `packages/db/src/env.ts` finds it by walking up for
`pnpm-workspace.yaml` and loads it before the client is constructed. It does not
use `import.meta.url`: the package is consumed from an ESM build (worker, web)
and a CommonJS one (the Nest API), and `import.meta` is illegal in the latter.
Existing environment values always win, so a deployment's real variables are
never overridden by a stray local file.

## D-04 — The payment calculator lives in `@avida/types`, not the API

**Status:** decided, 2026-09-09 · **§5.6**

The spec puts `computeSchedule` in the API's pricing module. It is a pure
function that both the server endpoint and the client-side calculator need, and
two implementations of the same arithmetic will eventually disagree about a
rounding cent. It sits in `packages/types/src/pricing.ts` with its tests; the API
resolves the data and calls it.

## D-05 — Milestone percentages are compared in basis points

**Status:** decided, 2026-09-09 · **§5.6 rule 5**

`percent` is a float, so `12.5 + 87.5 !== 100` is a live risk in binary floating
point. The sum is compared as integer basis points. 33.33 × 3 fails loudly, which
is correct — that structure cannot be represented exactly.

## D-06 — No Tailwind in Phase 0

**Status:** decided, 2026-09-09 · **§2.3, §3.1**

The spec lists Tailwind v4, and it will be added when there are components to
build. Phase 0 needs the token cascade to be the only colour authority, and
introducing a utility layer first invites `bg-neutral-100` to appear next to
`var(--surface)`. Tokens land in `styles/tokens.css`; Tailwind arrives in Phase 1
configured to consume those tokens, never to define colours.

## D-07 — Seed placeholders are SVG in the web app's `public/`

**Status:** decided, 2026-09-09 · **§4.6**

§4.6 asks for "solid-colour generated PNGs with the label baked in". They are
SVGs instead: no image-processing dependency in the db package, smaller, and
unmistakably not a render. They are written to `apps/web/public/seed-media/` and
served from the app's own origin, because Phase 0 has no media pipeline and no
reason to require MinIO to see a page. `mediaSrc()` routes any key starting
`seed-media/` locally and everything else to `NEXT_PUBLIC_MEDIA_URL`. Phase 2
replaces both the placeholders and that branch.

## D-08 — The seed generates all four time states for every media set

**Status:** decided, 2026-09-09 · **§4.3, §4.6**

§4.6 asks for 4 sets × 4 states = 16 assets; §4.3 sets a lower floor for
interiors (DAY and NIGHT). The seed generates all four for every set so the count
matches, and `requiredStates()` remains the validation rule the real renders must
satisfy. The seed throws if a set is incomplete.

## D-09 — `middleware.ts` renamed to `proxy.ts`

**Status:** decided, 2026-09-09 · **§6.1**

Next 16 deprecated the `middleware` file convention in favour of `proxy`. The UI
mode resolution (§6.1) is otherwise unchanged: query param, then cookie, then env
default, resolved in exactly one place.

## D-10 — Two dawn colour tokens were corrected

**Status:** decided, 2026-09-09 · **§2.3, §6.5, risk R5**

§2 is binding, and two of its dawn values fail the contrast floor §6.5 sets:

| Token | Spec | Ratio on dawn surface | Corrected to | New ratio |
|---|---|---|---|---|
| `--ink-muted` | `#63605F` | 4.39:1 (needs 4.5) | `#5F5C5B` | 4.67:1 |
| `--accent` | `#A0764C` | 2.85:1 (needs 3.0 for UI parts) | `#8E6842` | 3.52:1 |

Both are small darkenings that preserve the hue and the material reference
(anodised bronze). `apps/web/tests/tokens.contrast.test.ts` asserts the whole
palette on every run, so this class of failure cannot reach a Phase 1 axe report.
**This is a deviation from a binding section and should be reviewed by whoever
owns the design.**

## D-11 — The `--line` token is held to a house floor, not a WCAG one

**Status:** decided, 2026-09-09 · **§6.5**

`--line` is a decorative hairline; WCAG 1.4.11's 3:1 covers components that
convey meaning. Two of the spec's four states sit at 1.34–1.37 against their
surface. Rather than repaint the palette, the test asserts a visibility floor of
1.3 and the rule is written down: anything a visitor must perceive to understand
state uses `--ink-muted` or `--accent`, which are held to the real thresholds.

## D-12 — Dates are formatted in UTC

**Status:** decided, 2026-09-09 · **§3.5**

Every date the site shows is a calendar date, not an instant: handover, a
milestone, a progress capture. Formatting a UTC midnight in the viewer's local
zone moves it to the previous day for anyone west of Greenwich — caught by a test
that expected `3 Apr 2027` and got `2 Apr 2027`. `formatDate` pins `timeZone: 'UTC'`.

## D-13 — `currencyDisplay: 'narrowSymbol'`

**Status:** decided, 2026-09-09 · **§3.5**

`en-GB` renders USD as `US$285,000` and JPY as `JP¥4,500,000`. The site quotes
one currency throughout, so the country prefix carries no information and reads
as clutter in a headline price.

## D-14 — The image crossfade is a CSS animation on the incoming layer

**Status:** decided, 2026-09-09 · **§6.2**

The spec describes two stacked layers with an opacity swap. Implemented as: the
outgoing image underneath at full opacity, the incoming one above running a
1.2s fade-in, outgoing dropped on a timer.

The obvious alternative — mount the outgoing layer opaque and animate it to zero —
needs a paint in between, which means `requestAnimationFrame`. rAF does not run
in a background tab, so the outgoing layer would sit opaque over the new image
until its timer fired. Putting the animation on the incoming layer makes the
steady state already correct: if the animation is throttled, unsupported, or
disabled by reduced motion, the change is simply instant.

## D-15 — Seed fixtures use real development data

**Status:** replaced, 2026-09-11 · **§4.6, §15 Q1 resolved**

The seed fixture now carries Almasi Residences: a real project in Kimihurura,
Kigali with 28 units across Ground + 4 floors. Prices are illustrative (replaced
via the admin panel when the developer confirms them). See `seed-data.ts` and
`seed.ts` for the current fixture. The placeholder Kivu Ridge data was removed.

## D-16 — Shared packages are built to `dist/`

**Status:** decided, 2026-09-09

`@avida/types` and `@avida/db` publish `dist/` rather than TypeScript source: the
compiled Nest API loads them through Node's resolver, which cannot read `.ts`.
Turbo's `dependsOn: ["^build"]` orders this. Note that files under `apps/web` use
extensionless relative imports (Next's bundler resolution) while the Node-targeted
packages use explicit `.js` specifiers.

## D-17 — Enquiry retention is modelled in the schema from day one

**Status:** decided, 2026-09-09 · **§5.9**

`Enquiry.purgeAfter` is a required column set to `createdAt + 24 months`, indexed,
with a `pii:purge` queue already declared in the worker. Retention added later is
retention never added. `Enquiry.verificationSkipped` exists for the §6.7 case
where Turnstile is unreachable and a lead is kept for manual review rather than
dropped. `AdminAuditLog` records exports, deletes and bulk status changes.

---

## D-18 — Vulnerable transitive dependencies are pinned by override

**Status:** decided, 2026-09-09 · **§5.9**

`pnpm audit --audit-level=high` failed the build with 15 high and 2 critical
advisories, several in the request path (`@fastify/middie` middleware bypass,
`@nestjs/platform-fastify` HEAD/encoding bypasses). Nest was moved to 11.2.3 and
the rest are pinned through `pnpm.overrides`: `@fastify/middie`, `vitest`,
`vite`, `deepmerge-ts`, `picomatch`, `path-to-regexp`, `glob`, `lodash`,
`mysql2`. Audit now exits clean, so CI's gate is real rather than aspirational.
Overrides are reviewed whenever a direct dependency majors.

## D-19 — The admin is a plain React app, not Refine

**Status:** decided, 2026-09-09 · **§3.1, §9 Phase 1 task 2**

§3.1 lists Refine + Ant Design. The admin is three screens (dashboard, units,
enquiries) over an API that already enforces every rule — transitions, roles,
auditing — so Refine's data-provider and resource abstractions would be wrapping
four fetch calls. It is built as plain React with a typed client instead: fewer
dependencies, no design-system weight, and nothing to learn before changing it.

**Revisit if** the admin grows full CRUD over typologies, milestones, amenities,
landmarks, FAQs, tours and scenes as §5.4 describes. That is the point where
Refine's scaffolding starts paying for itself.

## D-20 — BullMQ queue names use hyphens

**Status:** decided, 2026-09-09 · **§5.8**

§5.8 names the queues `media:variants`, `video:encode` and so on. BullMQ 5
refuses a colon — it is the separator in its own Redis key scheme — and throws
at construction, so the worker crashed on boot. Wire names are hyphenated and
each queue keeps a `specName` for cross-reference. `queues.test.ts` asserts both
halves, because the failure mode was a crash at boot rather than a type error.

## D-21 — The payment calculator, time state and concierge parser live in `@avida/types`

**Status:** decided, 2026-09-09

A widening of D-04. Anything that must give the same answer on the server and
the client goes in the shared package with its tests: `computeSchedule`,
`parseIntent`, `checkNarration`, the status-transition table, the filter
predicate, and every formatter. The API and the web app import; neither
reimplements. This is why 60 of the 96 tests live in one package.

## D-22 — A depth map is never invented

**Status:** decided, 2026-09-09 · **§7.4, §13**

`media:depth` prefers a supplied Blender Z-depth pass, falls back to Depth
Anything V2 when `DEPTH_MODEL_PATH` is configured, and otherwise reports
`skipped`. It does not synthesise a plausible-looking depth map from luminance.
A fabricated depth map produces a parallax that misrepresents the building's
geometry, which §13 forbids; the hero simply renders flat, which §8.1 already
specifies as the degradation path.

`onnxruntime-node` is resolved at runtime and typed structurally, so the worker
builds and boots without a ~200MB native dependency most deployments never need.

## D-23 — The panorama reprojection is ours

**Status:** decided, 2026-09-09 · **§7.5, §5.8**

`media:tile` converts equirectangular to six cube faces and three tile levels
with about twenty lines of arithmetic rather than shelling out to a panorama
CLI. A build dependency on a binary that may not exist in the deploy image is a
worse trade than owning the projection, which is stable and testable.

## D-24 — The image crossfade animates the incoming layer

**Status:** decided, 2026-09-09 · **§6.2** — supersedes the mechanism in D-14

Same two-layer result, opposite direction: the outgoing image sits underneath at
full opacity and the incoming one fades in above it. Animating the outgoing
layer to zero needs a paint in between, which means `requestAnimationFrame` —
and rAF does not run in a background tab, so the stale image would sit over the
new one until its timer fired. Observed directly while verifying Phase 0.

## D-25 — Splat rendering and the concierge model are optional at runtime

**Status:** decided, 2026-09-09 · **§8.7, §9 Phase 5**

`@sparkjsdev/spark` is not in the lockfile: there is no captured scene to render
(§8.7 — splats only exist once something physical does), and a renderer for
content that does not exist is weight for no benefit. `SparkViewer` resolves it
at runtime and degrades to an explanatory message.

The concierge behaves the same way with `ANTHROPIC_API_KEY` absent: the
deterministic answer *is* the product, and narration is a wrapper over it. With
no key configured the concierge still answers correctly.

## D-26 — The concierge's guard is a rule, not a prompt

**Status:** decided, 2026-09-09 · **§9 Phase 5**

The model is told not to state numbers, and its output is then checked anyway:
every digit in the prose must appear in the query result, or the prose is
discarded and the deterministic sentence is shown instead. A prompt is a
request; the guard is the rule. A rejected narration is logged as an error to
us and is invisible to the visitor, who was always going to be shown the data.

Numbers reach the screen only through the structured result and our own
formatter — never from a sentence a model wrote.

## D-28 — The September 2026 brief replaces the §2 time-of-day design

**Status:** decided, 2026-09-11 · **supersedes §2.2, §2.3, parts of §2.1 and §2.4**

The developer's supplied renders are all dusk, so a palette bound to four times of
day had nothing to bind to, and the new brief asked for warm ivory, charcoal and a
restrained bronze. The site now has two hand-authored grounds in
`styles/tokens.css` — `stone` (default) and `night` (cinematic media) — and the
contrast test asserts both. Kept from §2: Gambetta and Supreme, bronze rather than
gold, sentence case in the source, status by fill treatment as well as colour, no
count-up numbers, no stock phrases.

The brief's lockups ("Kimihurura · Kigali", nav labels, statuses) are set in small
capitals with `font-variant-caps: all-small-caps` — never `text-transform:
uppercase` — so the text stays sentence case for screen readers and search.
Motion is now richer than §2.6 allowed (an opening sequence, a pinned scroll
passage, mask reveals on headlines) because the brief asks for it; every piece
checks `prefers-reduced-motion` and has a static equivalent.

## D-29 — Media: supplied renders, retouched; missing spaces generated and labelled

**Status:** decided, 2026-09-11 · **§7, §13**

The five supplied renders had marketing text baked in. They were retouched with
Higgsfield (GPT Image 2) to remove it and extended to 16:9; nine spaces with no
render at all (lobby, pool deck, restaurant, gym, wellness, co-working, en-suite,
parking, aerial) and three furnished plans were generated in the same visual
language; ten were animated (Kling 3.0, Cinema Studio). `lib/media-manifest.ts`
records each scene's provenance, and the page says so beside the image:
`supplied` scenes read "Artist's impression", `concept` scenes read "Concept
visual. Final interior design by the architect." Masters, prompts and job ids are
listed in `docs/ALMASI_MEDIA.md`; renditions are rebuilt with
`scripts/media/build-almasi-media.mjs` and the film with
`scripts/media/render-almasi-film.mjs`.

## D-30 — One UI mode; legacy routes parked, old URLs redirected

**Status:** decided, 2026-09-11 · **supersedes §6.1**

The single-page / multi-page switch does not survive a design built around one
cinematic home page and dedicated pages. The old route files were moved, not
deleted, into `app/_legacy-multi` and `app/_legacy-single` (Next ignores `_`
folders); remove them once nothing needs them. `proxy.ts` now only redirects old
public URLs: `/availability` and `/residences/<typology>` go to the explorer, and
`?ui=` is dropped.

## D-31 — Browser calls to the API are same-origin; Next reads the root `.env`

**Status:** decided, 2026-09-11 · **D-03, §5.2**

`next.config.mjs` rewrites `/api/v1/*` to the API, so the enquiry form and the live
inventory poll never need CORS and the API host never ships in a bundle. The same
file folds the repository's single `.env` into the Next process (existing
environment values win), which Next does not do on its own for a monorepo.
`NEXT_DIST_DIR` lets `scripts/dev-preview.mjs` run a second dev server beside
`pnpm dev`.

## D-32 — The 3D building is a procedural maquette until the architect's model exists

**Status:** decided, 2026-09-11 · **§8.4, risk R1**

`lib/building-model.ts` draws the building from plan rectangles — each residence
placed by its orientation in the inventory and sized by its area — and
`components/explore/Building3D.tsx` renders it with React Three Fiber. Status reads
as light (available homes glow), floors lift out on selection, and a custom camera
rig keeps a vertical swipe scrolling the page on a phone. When the decimated glTF
arrives, meshes named `unit_<code>` (`Unit.meshName`) plug into the same selection
and labels. The elevation stack is the keyboard, screen-reader and no-WebGL path.

## D-27 — Enquiry export is limited to OWNER and MARKETING

**Status:** decided, 2026-09-09 · **§5.9**

The schema's roles are OWNER, MARKETING and SALES. §5.9 requires the CSV export
to be audited but does not say who may run it. SALES reads the enquiry inbox in
the app and works individual leads; walking out with every lead's contact
details in one file is limited to the two roles accountable for the data. Both
paths write an `AdminAuditLog` row with the actor, the filter and the row count.

## D-33 — The admin database is the single source of truth

**Status:** decided, 2026-09-11 · **supersedes the "revisit" note in D-19**

The admin grew from three screens to the full platform the September brief asks
for: property, floors, residences, rooms, types and features, parking,
amenities, residents, buyers, enquiries, media, galleries, floor plans,
designs, pricing, payment plans, website copy, users and the audit log. It
stays plain React (no Refine): a small typed client, a query cache with
prefix invalidation, and one component set, all under `apps/admin/src`.

Rules that make the database authoritative:

- **The seed writes a first state only.** `packages/db/prisma/seed.ts` creates
  what is missing and never overwrites a row the admin may have edited
  (prices, statuses, amenities, FAQs, page copy). Re-seeding is safe.
- **Nothing counted is stored.** Dashboard, floor and type figures are
  computed from `Unit` rows per request; `Development.totalUnits` is legacy
  and unused.
- **The public site reads the API.** Contact details, amenities, galleries,
  page copy, residence photographs, plans and features arrive through
  `/api/v1/*`; the static media manifest remains only as a fallback until an
  image exists in the library. The residence groups on the site are derived
  from bedrooms and `Typology.isPenthouse`, so a type added in the admin
  lands in the right group.
- **Every visible write revalidates.** `PublicSync` busts the inventory cache
  and asks Next to revalidate the affected routes (dynamic segments by
  pattern). The one-minute `/inventory/live` poll stays the backstop.
- **Public selects are explicit.** `PublicService` and the legacy public
  endpoints select fields one by one, so a private column (notes, buyer,
  residents, tags, audit) cannot leak by being added to a table later.

Media uploads go through `StorageService`: signature-checked, stored once as
the original, and rendered to WebP at 400/800/1600/2400 px with a blur
placeholder. `STORAGE_DRIVER=local` (default) writes under `storage/media` and
serves `/api/v1/files/*` with a sandboxing CSP; `s3` writes to R2.
`pnpm media:import` moved the site's existing renders into the library.

## D-34 — Residence statuses, and who may undo a sale

**Status:** decided, 2026-09-11 · **supersedes the §5.5 pipeline in `@avida/types`**

Statuses are AVAILABLE, RESERVED, ON_HOLD, SOLD, OCCUPIED, UNAVAILABLE. The
migration mapped BOOKED → ON_HOLD and NOT_RELEASED → UNAVAILABLE. The strict
AVAILABLE → RESERVED → BOOKED → SOLD pipeline made the sales team fight the
tool, so open statuses now move freely. The one guarded edge is undoing a sale:
SOLD or OCCUPIED back to an open status needs `residence.reverse-sale` (super
admin). SOLD ↔ OCCUPIED is a move-in or move-out and follows the residents
module automatically. Every change writes `UnitStatusLog`, an audit row, and
moves the residence's parking bays with it. A general edit cannot change a
status; only the status endpoint can. A floor holding residences cannot be
deleted without naming where they go (`Unit.floor` is `onDelete: Restrict`).

## D-35 — Five roles, one permission table, enforced by the API

**Status:** decided, 2026-09-11 · **supersedes D-27**

Roles are SUPER_ADMIN, PROPERTY_MANAGER, SALES_MANAGER, CONTENT_MANAGER and
VIEWER (OWNER → SUPER_ADMIN, MARKETING → CONTENT_MANAGER, SALES →
SALES_MANAGER in the migration). `ROLE_PERMISSIONS` in `@avida/types` is the
only table: `AdminGuard` checks `@RequirePermission` on every request, and the
admin reads the same table only to hide what a role cannot use. Resident and
buyer contact details need `resident.view` / `buyer.view`; a viewer sees
neither. Roles are fixed in code rather than a Role table: the brief names
five, and editable permission sets would be a way to lock everyone out.
Sessions now slide their idle window while in use (still capped at 12 hours).

## D-36 — The admin's visual language

**Status:** decided, 2026-09-11

A light sky-blue and white command centre, distinct from the public site's
ivory and bronze: Plus Jakarta Sans headings, Inter body, soft shadows, status
colours fixed by the brief (green available, blue reserved, orange on hold,
red sold, purple occupied, grey unavailable). Desktop first; an icon rail
below 1180 px and a drawer below 820 px.
