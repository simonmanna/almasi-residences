# Luxury Residential Development Website — Implementation Specification

**Version 1.1 · Build specification for an autonomous coding agent · Updated 2026-09-09**

This file is the canonical spec. It supersedes `IMPLEMENTATION_PLAN (1).md`, which is kept
in the repo only as the v1.0 record. `BUILD_PROMPT.md` points a coding agent at *this* filename.

---

## 0. How to use this document

This is a complete build specification for a single-development luxury real estate website with 3D virtual tours, time-of-day visual transitions, and dual one-page/multi-page navigation modes.

**If you are an AI agent building this:**

1. Read the entire document before writing any code. Sections 2 (Design) and 7 (Visual assets) contain constraints that affect decisions in every other section.
2. Build in the phase order given in Section 9. Do not skip ahead. Each phase has acceptance criteria — meet them before moving on.
3. Section 2 is **binding**, not suggestive. It exists because the default output for this brief is a cliché, and the cliché is explicitly rejected.
4. Where this document specifies a library or version, use it. Where it does not, choose, and record the choice in `DECISIONS.md`.
5. Ask before inventing product requirements. Do not invent content, prices, or unit data — use the seed fixtures in Section 4.6.

**Terminology used throughout:**

| Term | Meaning |
|---|---|
| Development | The whole project being sold — one building or cluster |
| Unit | An individual apartment for sale, e.g. `8B` |
| Typology | A floor plan type shared by many units, e.g. "2-Bed Corner" |
| Node | One camera position inside a virtual tour |
| Scene | A node plus its hotspots and metadata |
| Time state | One of `dawn`, `day`, `dusk`, `night` |

---

## 0.6 Changelog

**v1.1 — 2026-09-09.** Content of v1.0 is unchanged and still binding. Added, because v1.0
left them open and each one blocks or bites during the build:

| § | Added |
|---|---|
| 0.7 | Repository state — what exists today, what Phase 0 starts from |
| 3.1 note | Dependency version policy: named majors are *floors*, pin at scaffold, record in `DECISIONS.md` |
| 3.5 | Formatting, locale and currency policy (was undefined; affects every price and area string) |
| 5.9 | Security and PII: enquiry retention, presigned-URL scoping, admin auth hardening, headers |
| 6.7 | Resilience: what the public site renders when the API or Redis is down |
| 9.0 | Phase 0 pre-flight — the eight questions in §15 must be answered before scaffolding |
| 10.1 | Field monitoring (RUM) — lab budgets alone do not prove §6.6 is met |
| 14 | Risk register with owners and triggers |
| 15 | Open questions blocking Phase 0 |
| 16 | Definition of done, per phase and per PR |

Nothing in v1.0 was deleted. Where v1.1 tightens a rule it says so explicitly.

---

## 0.7 Repository state (as of 2026-09-09)

`saimenogm/Real-Estate-Website` currently contains **documentation only**:

```
README.md                     (empty — write it in Phase 0, task 9)
BUILD_PROMPT.md               (agent hand-off prompt, Options A and B)
IMPLEMENTATION_PLAN (1).md    (v1.0, superseded — keep for history)
IMPLEMENTATION_PLAN.md        (this file — canonical)
```

No application code, no `package.json`, no CI, no lockfile, no `docs/`. Phase 0 therefore
starts from an empty tree, not from a partial scaffold. Do not assume any prior structure.

---

## 1. Product definition

### 1.1 What this is

A sales instrument for a single pre-construction residential development. It is not a property marketplace, not a listings portal, and not an agent CRM. There is one development, a fixed inventory of units, and one goal: convert a qualified visitor into a booked viewing or a paid reservation.

Every feature in this document either builds trust in a building that does not physically exist yet, or shortens the path to an enquiry. Features that do neither are out of scope.

### 1.2 Primary user

A buyer with capital, evaluating an off-plan purchase they cannot physically inspect. They are asking three questions the site must answer:

1. **What will I actually own?** — dimensions, orientation, finish level, what the view is from *my* floor.
2. **Can I trust this developer to deliver?** — track record, construction progress, payment protection.
3. **What does it cost me, and when?** — full payment schedule with dates, not a headline price.

Secondary user: the developer's sales agent, who needs live inventory status and enquiry routing.

### 1.3 Core feature set

| # | Feature | Phase |
|---|---|---|
| F1 | Marketing site with development narrative and location context | 1 |
| F2 | Live unit inventory with status, price, availability | 1 |
| F3 | Enquiry capture with WhatsApp routing and attribution | 1 |
| F4 | Payment schedule calculator | 1 |
| F5 | Admin panel for sales team | 1 |
| F6 | Automated media pipeline | 2 |
| F7 | **Time-of-day transition system** (day / dusk / night / aerial) | 2 |
| F8 | Depth-parallax hero | 2 |
| F9 | 360° virtual tour per typology | 3 |
| F10 | Interactive floor plans linked to tour nodes | 3 |
| F11 | **Scroll-driven 3D interactive video** (building exterior) | 4 |
| F12 | **Per-unit interactive video** (turntable + interior) | 4 |
| F13 | **Continuous walkthrough video** with chapter navigation | 4 |
| F14 | 3D building unit selector | 4 |
| F15 | Sun and view simulator | 4 |
| F16 | **One-page / multi-page UI mode switch** | 1 (arch), 3 (both live) |
| F17 | Gaussian splat immersive scene | 5 |
| F18 | AI concierge | 5 |
| F19 | Construction progress timeline | 6 |

---

## 2. Design direction — BINDING

### 2.1 Rejected defaults

The following are **forbidden**. They are what every generated "luxury real estate" page looks like, and shipping them makes the site indistinguishable from a template.

- Black or near-black background (`#0B0B0B`, `#111`, `#0A0A0A`) with a gold or champagne accent.
- Playfair Display, Cormorant Garamond, or Didot as the display face.
- Cream background near `#F4F1EA` with a terracotta accent near `#D97757`.
- ALL-CAPS tracked-out eyebrow labels above headings (`EXCLUSIVE RESIDENCES`, `THE VISION`).
- Meta strings joined with middle dots (`3 Bed · 142m² · Floor 8`).
- `→` appended to button and link text.
- Monospace typefaces for data labels.
- Identical rounded cards with the same `rgba(0,0,0,0.1)` shadow for every content type.
- Numbered markers (`01 / 02 / 03`) on content that is not a sequence.
- Fade-and-slide-up entrance animation on every section.
- Full-width gradient washes used as decoration.
- Stock phrases: "Elevate your lifestyle", "Where luxury meets", "Redefining urban living", "A sanctuary in the heart of".

### 2.2 The concept

**The palette is bound to time.** The site has four time states, and the entire visual system — background, type colour, accent, shadow depth, image set — transitions between them. This is the single bold move; everything else stays quiet.

This is not a dark-mode toggle. It is the building rendered at four moments of one day, with the interface changing light along with it. It directly serves the brief (a buyer wants to know what the west-facing units look like at sunset) and it is the memorable thing.

**Materials, not "luxury".** Colour comes from what the building is actually made of: board-formed concrete, bronze anodised aluminium, dark timber screening, terrazzo, and the eucalyptus green of the surrounding hills. Not from a generic luxury mood board.

### 2.3 Colour tokens

Defined as CSS custom properties on `:root`, overridden by `[data-time]` on `<html>`. All four states must be authored — do not generate them algorithmically from one base.

```css
/* ---- DAY (default) ---- */
[data-time="day"] {
  --surface:        #E4E3DD;  /* raw concrete, cool — deliberately not cream */
  --surface-raised: #EFEEE9;
  --surface-sunk:   #D6D5CE;
  --ink:            #232B24;  /* dark green-black, board-formed concrete in shade */
  --ink-muted:      #5E665C;
  --line:           #C2C1B8;
  --accent:         #8C6A45;  /* anodised bronze — matte, not gold */
  --accent-weak:    #B79C7E;
  --foliage:        #3F5B43;
  --scrim:          rgba(35, 43, 36, 0.32);
  --elev:           0 2px 24px rgba(35, 43, 36, 0.10);
}

/* ---- DAWN ---- */
[data-time="dawn"] {
  --surface:        #DCD8D2;
  --surface-raised: #E7E2DA;
  --surface-sunk:   #CBC6BF;
  --ink:            #2B2A2C;
  --ink-muted:      #63605F;
  --line:           #BFB9B1;
  --accent:         #A0764C;
  --accent-weak:    #C0A183;
  --foliage:        #4A5C4B;
  --scrim:          rgba(43, 42, 44, 0.30);
  --elev:           0 2px 24px rgba(43, 42, 44, 0.10);
}

/* ---- DUSK ---- */
[data-time="dusk"] {
  --surface:        #2E3038;
  --surface-raised: #383B44;
  --surface-sunk:   #23252B;
  --ink:            #E9E5DC;
  --ink-muted:      #A5A2A0;
  --line:           #4A4D57;
  --accent:         #C98F4E;  /* low sun on bronze */
  --accent-weak:    #8A6740;
  --foliage:        #46584A;
  --scrim:          rgba(20, 21, 26, 0.48);
  --elev:           0 2px 32px rgba(10, 11, 14, 0.42);
}

/* ---- NIGHT ---- */
[data-time="night"] {
  --surface:        #171B26;  /* deep indigo, never neutral black */
  --surface-raised: #1F2432;
  --surface-sunk:   #10131C;
  --ink:            #DFDCD4;
  --ink-muted:      #8E8F96;
  --line:           #2C3242;
  --accent:         #D9A566;  /* warm interior light spilling out */
  --accent-weak:    #8F6E45;
  --foliage:        #2F4438;
  --scrim:          rgba(8, 10, 16, 0.56);
  --elev:           0 2px 40px rgba(0, 0, 0, 0.55);
}
```

Transition rule: colour tokens animate over `900ms` with `cubic-bezier(0.4, 0.0, 0.2, 1)`. Images crossfade over `1200ms`. Never transition `transform` or layout properties on a time change — only colour and opacity.

### 2.4 Typography

Two families, both free for commercial use, both self-hosted as `.woff2` (do not use Google Fonts CDN — third-party requests hurt LCP on the target network).

| Role | Family | Source | Usage |
|---|---|---|---|
| Display | **Gambetta** (variable) | Fontshare | Headlines, unit numbers, prices, pull quotes |
| Interface | **Supreme** (variable) | Fontshare | Body, navigation, labels, forms, tables |

Gambetta is chosen because it carries the high-contrast elegance the brief needs without being Playfair, and its italic is genuinely beautiful — use the italic for the development's name and for pull quotes, not for random emphasis.

**Type scale** (major third, 1.250, base 17px):

```css
--text-2xs:  0.640rem;   /* 10.9px — legal, footnotes only */
--text-xs:   0.800rem;   /* 13.6px — table data, captions */
--text-sm:   0.900rem;   /* 15.3px — secondary body */
--text-base: 1.000rem;   /* 17.0px — body */
--text-md:   1.250rem;   /* 21.3px — lead paragraph */
--text-lg:   1.563rem;   /* 26.6px — section subhead */
--text-xl:   1.953rem;   /* 33.2px — section head */
--text-2xl:  2.441rem;   /* 41.5px — page head */
--text-3xl:  3.052rem;   /* 51.9px — hero secondary */
--text-4xl:  4.768rem;   /* 81.1px — hero display */
--text-5xl:  7.451rem;   /* 126.7px — the single largest moment on the site */
```

Rules:
- Body copy: Supreme 400, `line-height: 1.6`, `max-width: 68ch`.
- Display: Gambetta, `line-height: 1.04`, `letter-spacing: -0.02em` at `--text-3xl` and above.
- **All numeric data uses `font-variant-numeric: tabular-nums`.** Prices, floor numbers, square metres and payment schedules must align in columns.
- Sentence case everywhere. No `text-transform: uppercase` anywhere in the codebase.
- Never accent a single word in a headline with a different colour or weight.

### 2.5 Layout

**Grid:** 12 columns, `gutter: 24px`, `max-width: 1440px`, page margin `clamp(20px, 5vw, 96px)`.

**Spacing scale** (multiples of 4, non-linear at the top):
`4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192`

**Alignment:** left-aligned as default. Centre alignment is reserved for exactly two places — the hero display line and the final call to action. Centring everything is what makes pages feel like brochures rather than instruments.

**The signature structural device — the elevation stack.**

Do not build the unit inventory as a flat grid of coloured boxes. Build it as an architectural **section elevation**: floors stacked vertically as they exist in the building, each floor a row of units drawn to relative width, the ground floor at the bottom. It is literally how an architect draws a building, and it lets a buyer understand "I am on floor 9, three from the top" without reading a number.

```
                 ┌──────────────────────────────────────────┐
    Floor 10     │ [PH-A          ] [PH-B          ]        │  penthouse — wider units
                 ├──────────────────────────────────────────┤
    Floor 9      │ [9A ] [9B ] [9C ] [9D ] [9E ] [9F ]      │
                 ├──────────────────────────────────────────┤
    Floor 8      │ [8A ] [8B ] [8C ] [8D ] [8E ] [8F ]      │
                 ├──────────────────────────────────────────┤
       ⋮         │                    ⋮                     │
                 ├──────────────────────────────────────────┤
    Ground       │ [ lobby ][ retail ][    amenity deck   ] │
                 └──────────────────────────────────────────┘
                   ▲
                   └── status shown by fill treatment, not just hue:
                       available = solid accent
                       reserved  = 45° hatch
                       sold      = outline only, ink-muted
```

Status must be distinguishable without colour (hatch, fill, outline) so it survives colour-blindness and the four time states.

### 2.6 Motion

One orchestrated moment: **the time transition**. When a visitor moves the time scrubber, the sky, the building, the interface colour and the interior lights change together over 1.2 seconds. That is the site's signature.

Everything else responds only to user action:
- Hover on a unit: 120ms fill change. No lift, no shadow bloom, no scale.
- Opening a panel: 240ms height and opacity.
- Route change: 180ms crossfade only.

**Forbidden:** scroll-triggered fade-up on section entry, parallax on text, auto-playing carousels, counters that count up, marquees.

`@media (prefers-reduced-motion: reduce)` must disable the time crossfade (snap instantly), all scroll-driven sequences (show a static frame), and all transitions above 100ms.

### 2.7 Voice

Write like an architect describing the building, not like a brochure selling a lifestyle.

| Don't write | Write |
|---|---|
| "Elevate your living experience" | "Nine floors above the valley" |
| "Luxurious 3-bedroom sanctuary" | "Three bedrooms, 142m², west-facing" |
| "Submit Enquiry →" | "Request a viewing" |
| "Limited units remaining!" | "Six of 92 units available" |

Specific beats evocative. A number is more persuasive than an adjective.

---

## 3. Architecture

### 3.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Shared types between API and web |
| Frontend | Next.js 15 (App Router), TypeScript strict | SSG/ISR for LCP, RSC for data fetching |
| Styling | Tailwind CSS v4 + CSS custom properties | Tokens in CSS vars so time states cascade |
| Animation | Motion (framer-motion v11+) | The time transition and panel choreography |
| 3D | three.js + @react-three/fiber + @react-three/drei | Building selector, parallax, splats |
| Panorama | @photo-sphere-viewer/core v5 + virtual-tour + markers plugins | Tour |
| Splats | @sparkjsdev/spark | Phase 5 immersive scenes |
| Backend | NestJS 10 + Fastify adapter | Existing team competence, module structure |
| ORM | Prisma 5 | Type generation shared to frontend |
| Database | PostgreSQL 16 + PostGIS | Geo queries for location features |
| Cache/Queue | Redis + BullMQ | Media pipeline jobs |
| Object storage | Cloudflare R2 | Zero egress — critical at panorama payloads |
| CDN | Cloudflare | Image resizing, geographic edge |
| Image processing | sharp | Variants, tiling, format conversion |
| Video processing | ffmpeg (fluent-ffmpeg) | HLS ladders, frame sequences |
| Admin | Refine + Ant Design | Fast CRUD over the Nest API |
| Auth (admin only) | Lucia or Auth.js, credential + TOTP | Small fixed staff |
| Email | Resend | Enquiry notifications |
| Analytics | Umami (self-hosted) or Plausible | No cookie banner needed |
| Errors | Sentry | Both apps |
| Testing | Vitest, Playwright, Supertest | |

**Version policy.** The majors named above are **minimum floors chosen in 2025, not pins.**
At scaffold time, resolve the current stable major for every dependency, use it if it is
greater than or equal to the floor, and record the resolved version and any migration
consequence in `docs/DECISIONS.md`. Two known drifts to check first: Next.js and NestJS have
both shipped majors past the numbers above, and `framer-motion` has been renamed to the
`motion` package. Do not silently downgrade to the number printed here, and do not upgrade a
major without recording why. Commit a lockfile in the same PR as the scaffold.

**There is no public user authentication.** Buyers never create accounts. Enquiries are anonymous submissions. This removes an entire surface of complexity — do not add it.

### 3.2 Repository layout

```
avida-platform/
├── apps/
│   ├── web/                        # Next.js 15 public site
│   │   ├── app/
│   │   │   ├── (single)/           # one-page mode route group
│   │   │   ├── (multi)/            # multi-page mode route group
│   │   │   ├── api/                # route handlers (revalidation, og)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   ├── styles/
│   │   └── public/fonts/
│   ├── api/                        # NestJS
│   │   └── src/
│   │       ├── modules/
│   │       ├── common/
│   │       └── main.ts
│   ├── admin/                      # Refine SPA
│   └── worker/                     # BullMQ processors (separate process)
├── packages/
│   ├── db/                         # Prisma schema + client + seed
│   ├── types/                      # shared DTO types, zod schemas
│   ├── ui/                         # shared primitives if admin reuses them
│   └── config/                     # eslint, tsconfig, tailwind preset
├── infra/
│   ├── docker-compose.yml          # postgres, redis, minio (local R2)
│   └── ffmpeg/                     # encode presets
└── docs/
    ├── DECISIONS.md
    └── CONTENT_BRIEF.md            # what the developer must supply
```

### 3.3 Environments

| Env | Web | API | DB |
|---|---|---|---|
| local | :3000 | :3001 | docker compose |
| staging | Vercel preview | Fly.io / VPS | Neon branch |
| production | Vercel | Fly.io / Hetzner VPS | Managed Postgres + PostGIS |

### 3.4 Environment variables

```bash
# --- web ---
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_MEDIA_URL=              # R2 public bucket / CDN origin
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_UI_MODE_DEFAULT=multi   # "single" | "multi"
NEXT_PUBLIC_MAP_STYLE_URL=
NEXT_PUBLIC_WHATSAPP_NUMBER=
NEXT_PUBLIC_UMAMI_ID=
REVALIDATE_SECRET=

# --- api ---
DATABASE_URL=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
RESEND_API_KEY=
ENQUIRY_NOTIFY_EMAILS=              # comma separated
ADMIN_SESSION_SECRET=
WEB_REVALIDATE_URL=
REVALIDATE_SECRET=
SENTRY_DSN=

# --- worker ---
FFMPEG_PATH=
DEPTH_MODEL_PATH=                   # Depth Anything V2 onnx
SKYBOX_API_KEY=                     # optional, Blockade Labs
```

### 3.5 Formatting, locale and currency

v1.0 stored money correctly (§4.2) but never said how it is displayed. Fix that here, because
inconsistent number formatting is visible on every page.

- **One locale for v1**, from `NEXT_PUBLIC_LOCALE` (default `en-GB`). No i18n framework, no
  translation files, no locale routing — that is a non-goal (§12) until the developer asks.
- **One currency for v1**, `Development.currency`. No live FX conversion. If a second display
  currency is ever requested it is a converted *estimate* with a visible rate date, never a price.
- All formatting goes through `packages/types/format.ts` — `formatMoney`, `formatArea`,
  `formatDate`, `formatDistance`. Components never call `Intl` directly, so the rules stay in
  one file and are unit tested.
- `formatMoney` renders whole units, no decimals, grouped separators, symbol before the number.
  `285,000` not `285000.00`.
- Areas are m² to one decimal. Distances under 1km in metres, above in km to one decimal.
- Dates are `D MMM YYYY`. Never numeric-only dates — `03/04/2027` is ambiguous across the
  buyer audience this site targets.
- Everything numeric carries `font-variant-numeric: tabular-nums` (§2.4) including inside the
  formatter's output spans.

---

## 4. Data model

### 4.1 Complete Prisma schema

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]
}

// ─────────────────────────── Development ───────────────────────────

model Development {
  id            String   @id @default(cuid())
  slug          String   @unique
  name          String
  tagline       String?
  descriptionMd String   @db.Text
  city          String
  country       String
  addressLine   String?
  latitude      Float
  longitude     Float
  handoverDate  DateTime?
  currency      String   @default("USD")
  totalUnits    Int      @default(0)
  status        DevelopmentStatus @default(SELLING)

  buildings     Building[]
  typologies    Typology[]
  amenities     Amenity[]
  milestones    PaymentMilestone[]
  landmarks     Landmark[]
  mediaSets     MediaSet[]
  tours         Tour[]
  progress      ProgressUpdate[]
  faqs          Faq[]
  seo           SeoMeta?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum DevelopmentStatus {
  ANNOUNCED
  SELLING
  SOLD_OUT
  COMPLETED
}

// ─────────────────────────── Building / Units ───────────────────────

model Building {
  id             String  @id @default(cuid())
  developmentId  String
  development    Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  name           String
  floorCount     Int
  groundLabel    String  @default("Ground")
  // GLB for the 3D selector — see §8.4
  modelUrl       String?
  modelScale     Float   @default(1)
  floors         Floor[]

  @@index([developmentId])
}

model Floor {
  id          String  @id @default(cuid())
  buildingId  String
  building    Building @relation(fields: [buildingId], references: [id], onDelete: Cascade)
  level       Int              // 0 = ground
  label       String           // "Floor 8", "Penthouse"
  heightM     Float            // cumulative height above ground, for the view simulator
  units       Unit[]

  @@unique([buildingId, level])
  @@index([buildingId])
}

model Unit {
  id           String  @id @default(cuid())
  floorId      String
  floor        Floor   @relation(fields: [floorId], references: [id], onDelete: Cascade)
  typologyId   String
  typology     Typology @relation(fields: [typologyId], references: [id])

  code         String            // "8B"
  status       UnitStatus @default(AVAILABLE)
  priceMinor   Int               // store money in minor units, never Float
  currency     String  @default("USD")
  areaSqm      Float
  balconySqm   Float?
  orientation  Orientation
  viewTags     String[]          // ["golf", "valley", "city"]
  positionIndex Int              // left-to-right order on the elevation stack
  widthRatio   Float   @default(1) // relative width in the stack drawing
  // maps this unit to a mesh name inside the building GLB
  meshName     String?
  notes        String?

  enquiries    EnquiryUnit[]
  statusLog    UnitStatusLog[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([floorId, code])
  @@index([status])
  @@index([typologyId])
}

enum UnitStatus {
  AVAILABLE
  RESERVED
  BOOKED
  SOLD
  NOT_RELEASED
}

enum Orientation {
  N
  NE
  E
  SE
  S
  SW
  W
  NW
}

model UnitStatusLog {
  id        String     @id @default(cuid())
  unitId    String
  unit      Unit       @relation(fields: [unitId], references: [id], onDelete: Cascade)
  from      UnitStatus
  to        UnitStatus
  actor     String
  createdAt DateTime   @default(now())

  @@index([unitId])
}

// ─────────────────────────── Typology ───────────────────────────────

model Typology {
  id            String  @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  slug          String
  name          String            // "Two-bedroom corner"
  bedrooms      Int
  bathrooms     Float             // 2.5 is legal
  areaSqmMin    Float
  areaSqmMax    Float
  descriptionMd String? @db.Text

  floorPlanSvgUrl String?         // interactive plan, see §8.3
  floorPlanPngUrl String?
  glbUrl          String?         // per-unit 3D model, F12
  frameSeqId      String?         // interactive video frame sequence

  units         Unit[]
  tours         Tour[]
  mediaSets     MediaSet[]

  @@unique([developmentId, slug])
}

// ─────────────────────────── Media ──────────────────────────────────

/// A MediaSet groups the SAME view captured across time states.
/// This is the backbone of the day/night/aerial system (F7).
model MediaSet {
  id            String  @id @default(cuid())
  developmentId String?
  development   Development? @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  typologyId    String?
  typology      Typology? @relation(fields: [typologyId], references: [id], onDelete: Cascade)

  key           String            // "hero-exterior", "rooftop", "lobby"
  label         String
  kind          MediaSetKind
  cameraNote    String?           // for the render team: focal length, position
  sortOrder     Int     @default(0)

  assets        MediaAsset[]

  @@unique([developmentId, key])
  @@index([typologyId])
}

enum MediaSetKind {
  EXTERIOR
  INTERIOR
  AERIAL
  AMENITY
  CONTEXT
  PLAN
}

model MediaAsset {
  id         String   @id @default(cuid())
  mediaSetId String
  mediaSet   MediaSet @relation(fields: [mediaSetId], references: [id], onDelete: Cascade)

  timeState  TimeState
  role       AssetRole @default(PRIMARY)

  // originals + derivatives, all keys relative to R2 bucket root
  originalKey String
  width       Int
  height      Int
  variants    Json      // { avif: {400:key,...}, webp: {...} }
  depthKey    String?   // depth map PNG for parallax (F8)
  thumbhash   String
  dominantHex String?

  altText     String?
  credit      String?

  createdAt   DateTime @default(now())

  @@unique([mediaSetId, timeState, role])
  @@index([mediaSetId])
}

enum TimeState {
  DAWN
  DAY
  DUSK
  NIGHT
}

enum AssetRole {
  PRIMARY
  ALTERNATE
  DETAIL
}

// ─────────────────────────── Video ──────────────────────────────────

model VideoAsset {
  id           String @id @default(cuid())
  key          String @unique          // "walkthrough-2bed", "timelapse-hero"
  label        String
  kind         VideoKind
  typologyId   String?

  posterKey    String
  hlsKey       String?                 // .m3u8 master
  mp4Key       String?                 // fallback, h.264 720p
  durationSec  Float
  width        Int
  height       Int

  chapters     VideoChapter[]

  createdAt    DateTime @default(now())
}

enum VideoKind {
  WALKTHROUGH
  TIMELAPSE
  AERIAL
  AMBIENT
}

model VideoChapter {
  id           String @id @default(cuid())
  videoAssetId String
  videoAsset   VideoAsset @relation(fields: [videoAssetId], references: [id], onDelete: Cascade)
  label        String
  startSec     Float
  thumbKey     String?
  /// optional: jump into the panorama tour at this point
  linkedSceneId String?

  @@index([videoAssetId])
}

/// Scroll-driven interactive video (F11, F12). Stored as a frame ladder,
/// not a video file — see §8.5 for why.
model FrameSequence {
  id          String @id @default(cuid())
  key         String @unique          // "building-orbit", "typo-2bed-orbit"
  label       String
  kind        FrameSeqKind
  frameCount  Int
  // Multiple resolution ladders: { "480": {prefix, ext}, "960": {...} }
  ladders     Json
  loopable    Boolean @default(true)
  /// maps a frame index range to a unit / hotspot for click targeting
  hotspots    Json?

  createdAt   DateTime @default(now())
}

enum FrameSeqKind {
  ORBIT
  DOLLY
  TIMELAPSE
  ASSEMBLY
}

// ─────────────────────────── Virtual tour ───────────────────────────

model Tour {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  typologyId    String?
  typology      Typology? @relation(fields: [typologyId], references: [id])

  slug          String
  name          String
  startSceneId  String?
  scenes        Scene[]

  @@unique([developmentId, slug])
}

model Scene {
  id        String @id @default(cuid())
  tourId    String
  tour      Tour   @relation(fields: [tourId], references: [id], onDelete: Cascade)
  key       String            // "living", "kitchen", "master-bed"
  label     String
  sortOrder Int    @default(0)

  /// Panoramas per time state — the tour respects the global time selector
  panoramas PanoramaAsset[]

  /// initial camera
  yawDeg    Float @default(0)
  pitchDeg  Float @default(0)
  fovDeg    Float @default(70)

  /// position on the floor plan SVG, in plan viewBox coordinates
  planX     Float?
  planY     Float?
  planRotDeg Float?

  hotspots  Hotspot[]
  linksFrom Hotspot[] @relation("HotspotTarget")

  @@unique([tourId, key])
}

model PanoramaAsset {
  id         String    @id @default(cuid())
  sceneId    String
  scene      Scene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  timeState  TimeState
  /// low-res immediate preview, equirect 1024x512
  previewKey String
  /// full equirect original
  originalKey String
  /// cube-face tile manifest: { faceSize, levels:[{size,tileSize,prefix}] }
  tiles      Json
  width      Int
  height     Int

  @@unique([sceneId, timeState])
}

model Hotspot {
  id            String @id @default(cuid())
  sceneId       String
  scene         Scene  @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  kind          HotspotKind
  yawDeg        Float
  pitchDeg      Float
  label         String?
  targetSceneId String?
  targetScene   Scene? @relation("HotspotTarget", fields: [targetSceneId], references: [id])
  infoMd        String? @db.Text
  mediaAssetId  String?

  @@index([sceneId])
}

enum HotspotKind {
  NAVIGATE
  INFO
  MEASURE
  VIEW_OUT
}

// ─────────────────────────── Commercial ─────────────────────────────

model PaymentMilestone {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  sortOrder     Int
  label         String            // "On reservation", "On completion of structure"
  percent       Float             // 10 = 10%
  triggerType   MilestoneTrigger
  triggerDate   DateTime?
  triggerNote   String?

  @@index([developmentId])
}

enum MilestoneTrigger {
  ON_RESERVATION
  ON_SIGNING
  ON_DATE
  ON_CONSTRUCTION_STAGE
  ON_HANDOVER
}

model Amenity {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  name          String
  descriptionMd String?
  iconKey       String?
  mediaAssetId  String?
  sortOrder     Int    @default(0)
}

model Landmark {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  name          String
  category       LandmarkCategory
  latitude      Float
  longitude     Float
  /// computed by PostGIS at seed/update time, not hardcoded
  distanceM     Int?
  driveMinutes  Int?
  walkMinutes   Int?

  @@index([developmentId])
}

enum LandmarkCategory {
  SCHOOL
  EMBASSY
  HOSPITAL
  SHOPPING
  AIRPORT
  LEISURE
  BUSINESS
}

// ─────────────────────────── Leads ──────────────────────────────────

model Enquiry {
  id         String @id @default(cuid())
  name       String
  email      String
  phone      String
  countryIso String?
  message    String? @db.Text
  intent     EnquiryIntent @default(INFORMATION)

  units      EnquiryUnit[]

  source     String?          // "unit-panel", "footer", "floating-cta"
  utmSource  String?
  utmMedium  String?
  utmCampaign String?
  referrer   String?
  landingPath String?
  userAgent  String?

  status     EnquiryStatus @default(NEW)
  assignedTo String?
  internalNote String? @db.Text

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([status])
  @@index([createdAt])
}

enum EnquiryIntent {
  INFORMATION
  VIEWING
  RESERVATION
  BROKER
}

enum EnquiryStatus {
  NEW
  CONTACTED
  QUALIFIED
  WON
  LOST
  SPAM
}

model EnquiryUnit {
  enquiryId String
  enquiry   Enquiry @relation(fields: [enquiryId], references: [id], onDelete: Cascade)
  unitId    String
  unit      Unit    @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@id([enquiryId, unitId])
}

// ─────────────────────────── Content ────────────────────────────────

model ProgressUpdate {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  capturedOn    DateTime
  title         String
  bodyMd        String? @db.Text
  percentComplete Int?
  mediaAssetIds String[]
  splatUrl      String?

  @@index([developmentId, capturedOn])
}

model Faq {
  id            String @id @default(cuid())
  developmentId String
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  question      String
  answerMd      String @db.Text
  sortOrder     Int    @default(0)
}

model SeoMeta {
  id            String @id @default(cuid())
  developmentId String @unique
  development   Development @relation(fields: [developmentId], references: [id], onDelete: Cascade)
  title         String
  description   String
  ogImageKey    String?
  keywords      String[]
}

// ─────────────────────────── Ops ────────────────────────────────────

model MediaJob {
  id         String @id @default(cuid())
  kind       String            // "variants" | "depth" | "tile" | "hls" | "frames"
  refType    String
  refId      String
  status     JobStatus @default(QUEUED)
  attempts   Int    @default(0)
  error      String? @db.Text
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime @default(now())

  @@index([status])
}

enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
}

model AdminUser {
  id           String @id @default(cuid())
  email        String @unique
  passwordHash String
  name         String
  role         AdminRole @default(SALES)
  totpSecret   String?
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
}

enum AdminRole {
  OWNER
  MARKETING
  SALES
}
```

### 4.2 Money handling

Store all money as `Int` in minor units (cents). Never `Float`, never `Decimal` in the API surface. Format at the edge with `Intl.NumberFormat`. The API returns `{ amountMinor: 12000000, currency: "USD" }` and the frontend formats. This prevents the entire class of rounding bug in the payment calculator.

### 4.3 Time state as a first-class dimension

Note the shape: `MediaSet` is a *view*, `MediaAsset` is that view *at a time*. `Scene` is a tour position, `PanoramaAsset` is that position *at a time*. This is what makes F7 work — the global time selector changes a single piece of client state and every image on the page resolves to a different asset without any bespoke wiring.

**Rule:** every `MediaSet` in `EXTERIOR` and `AERIAL` kinds must have all four time states populated. `INTERIOR` sets require `DAY` and `NIGHT` minimum. The seed script must fail loudly if a set is incomplete, so missing renders are caught before launch, not by a visitor.

### 4.4 Derived values, never stored

Compute at query time, never persist: unit counts by status, price ranges per typology, percent sold, "starting from" prices. Persisting these creates drift the moment the sales team changes a status.

### 4.5 Indexes and query notes

- `Unit.status` is queried on every page load. Indexed.
- The elevation stack query fetches `Building → Floor → Unit → Typology` in one nested Prisma read. It is the single hottest query. Cache it in Redis for 30 seconds and bust on any `UnitStatusLog` write.
- `Landmark.distanceM` is computed with PostGIS `ST_Distance` on a raw query at seed and whenever coordinates change. Do not compute in JS.

### 4.6 Seed fixtures

Seed with a plausible but clearly placeholder development so the site is demonstrable before real content arrives:

- 1 development, 1 building, 10 floors, 92 units
- 5 typologies: studio, 1-bed, 2-bed, 2-bed corner, penthouse
- Status distribution: 48 available, 12 reserved, 8 booked, 20 sold, 4 not released
- 6 payment milestones summing to exactly 100%
- 8 amenities, 10 landmarks with real coordinates near the development
- 4 media sets × 4 time states = 16 placeholder assets (solid-colour generated PNGs with the label baked in, so missing art is obvious)
- 2 tours, 5 scenes each, hotspots wired into a connected graph
- 25 enquiries across all statuses

Seed must be idempotent and runnable with `pnpm db:seed --reset`.

---

## 5. Backend specification

### 5.1 Module structure

```
apps/api/src/modules/
├── development/     # read-heavy, public
├── inventory/       # units, floors, status transitions
├── typology/
├── media/           # assets, sets, upload signing
├── video/
├── tour/            # scenes, hotspots, panoramas
├── enquiry/         # public write + admin read
├── pricing/         # payment schedule computation
├── location/        # PostGIS landmark queries
├── progress/
├── admin/           # auth, users, audit
└── health/
```

Each module is a standard Nest module with `controller`, `service`, `dto`, and where relevant a `*.processor.ts` for BullMQ consumers.

### 5.2 API conventions

- Base path `/api/v1`.
- All public read endpoints are cacheable: send `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`. The exception is `/inventory/live` — see below.
- Validation with `class-validator` + a global `ValidationPipe` (`whitelist: true, transform: true, forbidNonWhitelisted: true`).
- Responses use a consistent envelope only for lists: `{ data: T[], meta: { total, page, pageSize } }`. Single resources return the object directly.
- Errors follow RFC 7807 problem+json: `{ type, title, status, detail, instance }`.
- Global rate limit via `@nestjs/throttler`: 120 req/min per IP; `/enquiry` is 5 per 10 min per IP.
- CORS: allow the web origin and admin origin only.
- Every response carries `X-Request-Id`; log it with pino.

### 5.3 Public endpoints

```
GET  /api/v1/development/:slug
     → full development with typologies, amenities, milestones, landmarks,
       faqs, seo, and mediaSets (assets grouped by timeState)

GET  /api/v1/development/:slug/inventory
     → the elevation stack payload:
       { buildings: [{ id, name, floors: [{ level, label, heightM,
         units: [{ id, code, status, priceMinor, areaSqm, orientation,
         viewTags, positionIndex, widthRatio, typology: {slug,name,bedrooms} }] }] }],
         summary: { total, byStatus: {...}, priceMinorMin, priceMinorMax } }

GET  /api/v1/inventory/live?development=:slug
     → minimal status-only delta: [{ id, status, priceMinor }]
       Cache-Control: no-store. Polled by the client every 60s.

GET  /api/v1/typology/:devSlug/:typoSlug
     → typology detail with units, floorplan, tour ref, frameSeq ref, mediaSets

GET  /api/v1/unit/:id
     → unit detail + computed payment schedule + typology + tour entry point

GET  /api/v1/tour/:devSlug/:tourSlug
     → { id, name, startSceneId, scenes: [{ id, key, label, yawDeg, pitchDeg,
         fovDeg, planX, planY, panoramas: { DAY: {previewKey, tiles, ...}, ... },
         hotspots: [...] }] }

GET  /api/v1/video/:key
     → { hlsKey, mp4Key, posterKey, durationSec, chapters: [...] }

GET  /api/v1/frames/:key
     → { frameCount, ladders, loopable, hotspots }

POST /api/v1/pricing/schedule
     body: { unitId, startDate?, currency? }
     → { unitId, totalMinor, currency, rows: [{ sortOrder, label, percent,
         amountMinor, dueDate, triggerType, triggerNote }], cumulative: [...] }

GET  /api/v1/location/:devSlug/landmarks?category=
     → landmarks with distance and travel time

POST /api/v1/enquiry
     body: { name, email, phone, message?, intent, unitIds[],
             source, utm{}, referrer, landingPath, turnstileToken }
     → 201 { id, whatsappUrl }

GET  /api/v1/health   |   GET /api/v1/health/deep
```

### 5.4 Admin endpoints

All under `/api/v1/admin`, guarded by session cookie + role guard.

```
POST   /admin/auth/login            # email + password + TOTP
POST   /admin/auth/logout
GET    /admin/me

GET    /admin/units                 # filter, sort, paginate
PATCH  /admin/units/:id             # status, price, notes
POST   /admin/units/bulk-status     # { ids[], status } — the daily action
GET    /admin/units/:id/history

CRUD   /admin/typologies
CRUD   /admin/milestones
CRUD   /admin/amenities
CRUD   /admin/landmarks
CRUD   /admin/faqs
CRUD   /admin/progress

POST   /admin/media/upload-url      # returns presigned R2 PUT + assetId
POST   /admin/media/:id/complete    # enqueues processing jobs
GET    /admin/media/sets            # shows which time states are MISSING
DELETE /admin/media/:id

CRUD   /admin/tours, /admin/scenes, /admin/hotspots
POST   /admin/scenes/:id/panorama   # per time state

GET    /admin/enquiries             # filter by status, date, unit
PATCH  /admin/enquiries/:id
GET    /admin/enquiries/export.csv

GET    /admin/jobs                  # media pipeline status board
POST   /admin/jobs/:id/retry
POST   /admin/revalidate            # triggers Next.js ISR revalidation
```

### 5.5 Status transition rules

Encode in `InventoryService`, not the UI:

```
NOT_RELEASED → AVAILABLE
AVAILABLE    → RESERVED | NOT_RELEASED
RESERVED     → BOOKED | AVAILABLE          (release after expiry)
BOOKED       → SOLD | AVAILABLE
SOLD         → (terminal, OWNER role only can reverse)
```

Every transition writes a `UnitStatusLog` row with the actor. Every transition busts the Redis inventory cache and fires a revalidation webhook to Next.js for the affected paths.

### 5.6 Payment schedule computation

Pure function, unit tested, no LLM involvement ever.

```ts
function computeSchedule(
  unit: { priceMinor: number; currency: string },
  milestones: PaymentMilestone[],
  handoverDate: Date,
  startDate = new Date(),
): ScheduleRow[]
```

Rules:
1. Milestones sort by `sortOrder`.
2. `amountMinor = Math.round(priceMinor * percent / 100)` per row.
3. **Rounding residue is added to the final row** so the sum equals `priceMinor` exactly. Assert this in a test.
4. Due dates: `ON_RESERVATION` → `startDate`; `ON_SIGNING` → `startDate + 14d`; `ON_DATE` → `triggerDate`; `ON_HANDOVER` → `handoverDate`; `ON_CONSTRUCTION_STAGE` → `triggerDate` if set, else `null` with `triggerNote` shown instead of a date.
5. Validate at seed and on milestone save that percentages sum to exactly 100. Reject otherwise.

### 5.7 Enquiry pipeline

1. Verify Cloudflare Turnstile token. Reject on failure with 400.
2. Honeypot field check (`company` must be empty).
3. Normalise phone to E.164 with `libphonenumber-js`, defaulting to the development's country.
4. Persist `Enquiry` + `EnquiryUnit` rows in a transaction.
5. Enqueue notification job: email to `ENQUIRY_NOTIFY_EMAILS` via Resend, with unit codes and prices in the subject line.
6. Build and return a WhatsApp deep link:
   `https://wa.me/{NUMBER}?text={encoded}` where the text pre-fills:
   `Hello, I'm interested in unit 8B (2-bedroom corner, 142m²) at {Development}. My name is {name}.`
7. Return 201 within 300ms — the email send must not block the response.

### 5.8 Background workers

Separate process, `apps/worker`. Queues:

| Queue | Job | Concurrency |
|---|---|---|
| `media:variants` | sharp → AVIF/WebP at 6 widths + thumbhash | 4 |
| `media:depth` | Depth Anything V2 → depth PNG | 1 (GPU/CPU bound) |
| `media:tile` | equirect → cube faces → multi-level tiles | 2 |
| `media:frames` | video/render sequence → frame ladders + manifests | 2 |
| `video:encode` | ffmpeg → HLS ladder + mp4 fallback + poster | 1 |
| `notify:email` | Resend | 10 |
| `geo:distance` | PostGIS landmark recompute | 1 |

All jobs are idempotent — re-running produces the same keys. Failures retry 3× with exponential backoff, then write to `MediaJob` with `FAILED` and surface on the admin jobs board.

### 5.9 Security and personal data

v1.0 covered Turnstile and rate limits but not the handling of the personal data an enquiry
creates. An `Enquiry` row is name, email, phone, and buying intent — it is exactly the data a
breach makes expensive.

**Enquiry PII**
- Retention: 24 months from last status change, then hard delete via a nightly job. Log the
  deletion count, not the rows.
- `GET /admin/enquiries/export.csv` writes an `AdminAuditLog` row with actor, filter and row
  count. Exporting the customer list is an audited action, not a convenience.
- Privacy policy must state the retention period, the notify-email recipients, and the
  WhatsApp hand-off (the deep link moves the conversation to Meta's platform — say so).
- Never log `email`, `phone` or `message` at any level. Pino redaction paths configured
  globally, tested with a log-capture assertion.

**Object storage**
- Presigned PUT URLs are scoped to one key prefix, one content-type, a max content-length, and
  expire in 300 seconds. A presigned URL that accepts any key is an open bucket.
- Originals live in a private bucket. Only derivatives are public. `R2_PUBLIC_URL` never points
  at the original prefix.
- Uploaded files are validated by magic bytes in the worker, not by extension or client MIME.

**Admin auth**
- TOTP is mandatory (§3.1). Add: recovery codes issued once at enrolment, session cookie
  `httpOnly` + `secure` + `sameSite=strict`, absolute session lifetime 12 hours, idle timeout
  60 minutes, login rate limit 5 per 15 minutes per IP *and* per email.
- Role guard on every admin route by default (deny-list, not allow-list). `SOLD → *` reversal
  stays OWNER-only per §5.5.

**Headers and supply chain**
- CSP with no `unsafe-inline` for scripts; nonce the few inline blocks Next.js needs. `frame-ancestors 'none'`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS with preload in production.
- Dependabot or Renovate on, `pnpm audit --audit-level=high` in CI, failing the build.
- No secret ever reaches `NEXT_PUBLIC_*`. CI greps for that in the same step as lint.

---

## 6. Frontend specification

### 6.1 The dual UI mode (F16)

The site must ship **both** a single-page and a multi-page experience over the same data and the same components. This is a real requirement, not a toggle on a stylesheet.

**Implementation:** two Next.js route groups sharing a component library.

```
app/
├── (single)/
│   └── page.tsx                 # "/" — everything, section-scrolled
├── (multi)/
│   ├── page.tsx                 # "/" — hero + summary only
│   ├── residences/page.tsx
│   ├── residences/[typology]/page.tsx
│   ├── availability/page.tsx
│   ├── location/page.tsx
│   ├── gallery/page.tsx
│   ├── tour/[slug]/page.tsx
│   ├── progress/page.tsx
│   └── enquire/page.tsx
└── layout.tsx
```

**Mode resolution order:**
1. `?ui=single|multi` query param (highest — for stakeholder demos and link sharing)
2. `ui_mode` cookie, set by the in-site switch
3. `NEXT_PUBLIC_UI_MODE_DEFAULT`

Resolve in `middleware.ts` and rewrite to the matching route group. The URL the visitor sees stays clean.

**Sections are the shared unit.** Every piece of content is a `Section` component with a stable id:

```tsx
// components/sections/index.ts — the shared registry
export const SECTIONS = {
  hero:         { id: 'hero',         label: 'Overview',      route: '/' },
  narrative:    { id: 'narrative',    label: 'The building',  route: '/' },
  residences:   { id: 'residences',   label: 'Residences',    route: '/residences' },
  availability: { id: 'availability', label: 'Availability',  route: '/availability' },
  amenities:    { id: 'amenities',    label: 'Amenities',     route: '/residences' },
  location:     { id: 'location',     label: 'Location',      route: '/location' },
  gallery:      { id: 'gallery',      label: 'Gallery',       route: '/gallery' },
  tour:         { id: 'tour',         label: 'Virtual tour',  route: '/tour' },
  payment:      { id: 'payment',      label: 'Payment plan',  route: '/availability' },
  developer:    { id: 'developer',    label: 'The developer', route: '/' },
  progress:     { id: 'progress',     label: 'Progress',      route: '/progress' },
  enquire:      { id: 'enquire',      label: 'Enquire',       route: '/enquire' },
} as const;
```

Single-page mode renders all sections in order with `id` anchors; navigation scrolls with `scrollIntoView({ behavior: 'smooth', block: 'start' })` and updates the hash. Multi-page mode renders subsets per route; navigation is `<Link>`.

**Navigation component reads the mode and adapts** — same markup, different `href` (`#availability` vs `/availability`) and different active-state logic (IntersectionObserver vs pathname).

**Differences that are allowed:** single-page mode gets a sticky progress rail on the left showing section position; multi-page mode gets breadcrumbs and per-page OG metadata. Multi-page mode is the SEO default in production because per-typology pages rank.

### 6.2 Time-state system (F7) — the core client architecture

```tsx
// lib/time-state/TimeStateProvider.tsx
type TimeState = 'dawn' | 'day' | 'dusk' | 'night';

interface TimeStateContext {
  state: TimeState;
  setState: (s: TimeState) => void;
  isTransitioning: boolean;
  /** 0..1 position for the scrubber, maps to the 4 discrete states */
  scrubPosition: number;
  setScrub: (p: number) => void;
  /** true while an automatic timelapse cycle is running */
  isCycling: boolean;
  toggleCycle: () => void;
}
```

Behaviour:
- Provider sets `data-time` on `<html>`. All colour tokens cascade from there. No component reads the time state to compute a colour.
- Initial state derived from the visitor's local clock: 05:00–07:59 `dawn`, 08:00–16:59 `day`, 17:00–19:29 `dusk`, else `night`. Overridable, persisted to `localStorage`.
- `<TimedImage mediaSetKey="hero-exterior" />` subscribes to context, resolves the matching `MediaAsset`, and crossfades. Implementation: two stacked `<picture>` elements, opacity swap, the outgoing one unmounted on `transitionend`.
- **Preload strategy:** the current state loads eagerly, adjacent states (`dusk` if on `day`) preload at `low` fetch priority once the page is idle. Non-adjacent states load on demand. Do not preload all four — that is 4× the payload.
- Missing asset for a state: fall back to `DAY`, log a warning, never render a broken image.

**The scrubber control.** A horizontal track, bronze accent, positioned bottom-right of the hero in single-page mode and in the sticky header in multi-page mode. Four labelled stops with a continuous drag between them. Dragging past a midpoint commits to the next state. It must be keyboard operable (`ArrowLeft`/`ArrowRight`, `role="slider"`, `aria-valuetext="Dusk"`).

**Timelapse cycle mode.** A small play control next to the scrubber runs `dawn → day → dusk → night → dawn` on a 4-second dwell with the standard 1.2s crossfade. It stops on any user interaction with the scrubber. Off by default. Disabled entirely under `prefers-reduced-motion`.

### 6.3 Route and section inventory

| Section | Content | Key components |
|---|---|---|
| Hero | Full-bleed `TimedImage` of the building with depth parallax, development name in Gambetta italic at `--text-5xl`, one line of orientation, the time scrubber | `Hero`, `DepthParallax`, `TimeScrubber` |
| Narrative | The architectural idea in ≤4 short paragraphs, one full-bleed aerial `TimedImage` between them | `Prose`, `TimedImage` |
| Residences | Typology cards → detail. Each shows plan thumbnail, beds, area range, price from, count available | `TypologyGrid`, `TypologyDetail` |
| Availability | The elevation stack, filters, unit panel | `ElevationStack`, `UnitFilters`, `UnitPanel` |
| Amenities | Editorial layout, not a card grid — alternating image/text with real descriptions | `AmenityFeature` |
| Location | Map + landmark list with real distances, aerial `TimedImage` with labelled overlay | `LocationMap`, `LandmarkList` |
| Gallery | Masonry, filterable by time state and by set kind | `Gallery`, `Lightbox` |
| Tour | Panorama viewer + floor plan minimap | `TourViewer`, `PlanMinimap` |
| Interactive video | Scroll-driven building orbit | `FrameSequencePlayer` |
| Walkthrough | Chaptered video player | `WalkthroughPlayer` |
| Payment | Milestone table + calculator | `PaymentSchedule` |
| Developer | Track record, completed projects, credentials | `TrackRecord` |
| Progress | Dated timeline of construction | `ProgressTimeline` |
| Enquire | Form + WhatsApp + direct contacts | `EnquiryForm` |

### 6.4 Key component contracts

```tsx
// The elevation stack — §2.5
interface ElevationStackProps {
  building: BuildingWithFloors;
  selectedUnitId?: string;
  filters: { typologySlugs?: string[]; status?: UnitStatus[];
             priceMinorMax?: number; orientation?: Orientation[] };
  onSelect: (unitId: string) => void;
}
```

Rendered as **SVG**, not divs. Reasons: crisp at any zoom, hatch patterns via `<pattern>`, single accessible tree, trivially exportable as a PDF for the sales team. Each unit is a `<g role="button" tabIndex={0}>` with `aria-label="Unit 8B, two-bedroom corner, 142 square metres, available, 285,000 US dollars"`.

Non-matching units under a filter drop to 30% opacity — they stay visible, because seeing that the building is 78% sold is itself persuasive.

```tsx
interface TimedImageProps {
  mediaSetKey: string;
  priority?: boolean;
  sizes: string;
  aspect: number;
  /** render the depth-parallax shader instead of a flat image */
  parallax?: boolean;
  className?: string;
}

interface FrameSequencePlayerProps {
  sequenceKey: string;
  /** 'scroll' drives frames from scroll position, 'drag' from pointer */
  driver: 'scroll' | 'drag' | 'auto';
  scrollHeightVh?: number;   // scroll mode: how much scroll maps to one loop
  onFrameHotspot?: (hotspotId: string) => void;
}

interface TourViewerProps {
  tourSlug: string;
  initialSceneKey?: string;
  showPlan?: boolean;
  /** tour panoramas follow the global time state */
  respectTimeState?: boolean;
}
```

### 6.5 Accessibility floor

Non-negotiable, tested in CI with `@axe-core/playwright`:

- Contrast ≥ 4.5:1 for body text in **all four** time states. Verify each token pair; the dusk state is the one that will fail if you are careless.
- Visible focus ring: `2px solid var(--accent)` with `2px` offset. Never `outline: none` without a replacement.
- Every interactive SVG element is keyboard reachable and announces its state.
- The panorama viewer has a keyboard mode (arrow keys pan, `Tab` cycles hotspots, `Enter` activates) and a text alternative listing the rooms with descriptions.
- `prefers-reduced-motion` honoured everywhere per §2.6.
- All video has captions where speech exists, and is never autoplay-with-sound.

### 6.6 Performance budgets

Enforced by Lighthouse CI on every PR, tested on Moto G Power / 4G throttle:

| Metric | Budget |
|---|---|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.05 |
| Initial JS (route) | ≤ 180KB gzip |
| Hero image (AVIF, 1440w) | ≤ 180KB |
| Total on first paint | ≤ 900KB |
| Frame sequence, mobile ladder | ≤ 2.5MB for a full loop |
| Panorama first view | ≤ 400KB |
| Splat scene initial | ≤ 25MB, behind explicit user action |

Everything 3D is `dynamic(() => import(...), { ssr: false })` and below the fold. Nothing WebGL blocks first paint.

### 6.7 Resilience — what renders when the backend is down

v1.0 specified four caching layers (§11) but never said what a visitor sees when the API is
unreachable. Answer it here, because a sales site that 500s is worse than a stale one.

| Failure | Behaviour |
|---|---|
| API down at **build** time | Build fails. Do not ship a page with no inventory. |
| API down at **ISR revalidate** | Next.js serves the last good static render. Log to Sentry, alert. Never blank. |
| API down for `/inventory/live` poll | Client keeps the last-known statuses, stops polling after 3 consecutive failures, shows a quiet "Availability last updated HH:MM" line. No error toast — it is not the visitor's problem. |
| Redis down | Inventory query falls through to Postgres directly. Slower, still correct. Never a 500. |
| Turnstile unreachable | Enquiry form still submits; server marks the row `verificationSkipped` for manual review rather than losing a lead. |
| R2/CDN image 404 | `TimedImage` falls back `state → DAY → thumbhash placeholder`. Never a broken-image icon (§6.2 already requires this; it applies to every media component). |
| Email send fails | Enquiry is already persisted (§5.7 step 4 precedes step 5). Job retries 3×, then surfaces on the admin jobs board. A lead is never lost to a mail failure. |

Rule: **the enquiry path degrades last.** If anything is still working, a visitor can still
submit an enquiry.

---

## 7. Visual asset production (F7, F8)

This section is as important as the code. **The site's quality ceiling is set by the renders, not the implementation.** Hand this section to whoever produces the imagery.

### 7.1 The asset matrix

For each `MediaSet`, produce the identical camera at four times of day. Same lens, same position, same composition — only the lighting changes. Any camera drift between states destroys the crossfade.

| Set key | Kind | Times required | Notes |
|---|---|---|---|
| `hero-exterior` | EXTERIOR | all 4 | Primary approach view, 35mm equivalent |
| `aerial-context` | AERIAL | all 4 | ~120m altitude, shows the site in the city |
| `aerial-top` | AERIAL | day, dusk | Overhead, for the location overlay |
| `facade-detail` | EXTERIOR | day, dusk, night | Close on the bronze screening |
| `rooftop` | AMENITY | dusk, night | Dusk is the money shot here |
| `pool` | AMENITY | day, dusk | |
| `lobby` | INTERIOR | day, night | |
| `typo-{slug}-living` | INTERIOR | day, night | One per typology |
| `typo-{slug}-kitchen` | INTERIOR | day, night | |
| `typo-{slug}-balcony` | INTERIOR | day, dusk, night | The view is the product |

### 7.2 Lighting definitions

Give the render team exact sun angles rather than adjectives. Compute with `suncalc` for the development's actual latitude and longitude on a representative clear day:

| State | Sun altitude | Description |
|---|---|---|
| `dawn` | +4° to +8° | Long shadows, cool ambient, warm rim light, interior lights still on at 30% |
| `day` | +55° to +70° | High sun, short shadows, strong sky bounce, interiors unlit |
| `dusk` | −2° to +3° | Sun at horizon, sky gradient amber to indigo, interior lights at 70%, facade uplighting on |
| `night` | −18° | No sun, moon + sky ambient only, interiors at 100%, landscape and facade lighting full |

Render as 16-bit EXR, tone-map consistently across the four states with a single LUT. Deliver as PNG at 4096px on the long edge minimum. **Do not colour-grade the four states independently** — they must feel like one day, not four photographs.

### 7.3 Aerial timelapse (F7 extension)

Beyond the four stills, produce one continuous aerial timelapse for the hero of the location section:

- Camera: slow orbit around the development, 120m altitude, ~20° downward tilt.
- Duration: 12 seconds, looping seamlessly (last frame matches first).
- Lighting: animate the sun through the full dawn→night cycle across the 12 seconds.
- Deliver: 1920×1080 ProRes master → pipeline encodes to HLS ladder (1080/720/480) + a 720p MP4 fallback + WebP poster.
- Must loop without a visible cut. Test by playing it four times through.

### 7.4 Depth maps (F8)

Generated automatically by the worker, not by the render team — but if the render is CG, exporting a real Z-depth pass from Blender is dramatically better than inferring one.

**Preferred:** Blender Z-depth pass, normalised to 0–1, exported as 16-bit PNG alongside the beauty render.
**Fallback:** Depth Anything V2 ONNX in the worker, `onnxruntime-node`, output 8-bit PNG at 1/2 the beauty resolution.

The parallax shader displaces along the depth map by a maximum of `0.035` in normalised device coordinates. More than that and the edges tear visibly.

### 7.5 Panoramas

- Blender: equirectangular panoramic camera, 8192×4096, Cycles, 2048 samples, denoised.
- Camera at 1.6m height, level, no roll. **Nadir and zenith must be clean** — no tripod artifact, no missing geometry above.
- One panorama per scene per required time state.
- Worker converts to cube faces (6 × 2048px), then generates 3 tile levels (512, 1024, 2048) plus a 1024×512 equirect preview.

### 7.6 Frame sequences (F11, F12)

For the scroll-driven interactive video:

- **Building orbit:** 120 frames, full 360° orbit, camera at 40m altitude, 15° down tilt, subject centred and stable (no bob).
- **Per-typology orbit:** 90 frames orbiting a cutaway 3D model of the unit with the roof removed.
- Render at 1920×1080, deliver as PNG sequence.
- Worker produces three ladders: 480w (mobile), 960w (tablet), 1440w (desktop), all AVIF, quality 55.
- **Also produce a packed video version** — the same frames encoded as a keyframe-only H.264 MP4 at CRF 20 — for browsers where the frame-by-frame image approach is too memory-hungry. The player picks based on `deviceMemory` and connection.

### 7.7 Walkthrough video (F13)

- Continuous camera path through a full typology: entry → hallway → living → kitchen → balcony → bedroom → bathroom.
- 60–90 seconds, 30fps, no cuts. Smooth, slow, tripod-like — not handheld, not drone-swoopy.
- Ambient audio only; no voiceover, no music track (music dates instantly and clients change their minds).
- Chapter markers at each room boundary, recorded as timecodes and stored in `VideoChapter`.
- **Each chapter links to the matching tour scene** via `VideoChapter.linkedSceneId`, so a visitor can stop the video in the kitchen and step into the 360° tour at exactly that spot. This link is the feature — a video and a tour that don't connect are two separate things; connected, they're one experience.

### 7.8 What the developer must supply

Put this in `docs/CONTENT_BRIEF.md` and send it before Phase 1:

1. Architect's 3D model (Revit / 3ds Max / SketchUp) — **blocks Phases 3 and 4**
2. Approved floor plans as vector (PDF or DWG) per typology
3. Full unit schedule: code, floor, typology, area, orientation, price, current status
4. Payment milestone structure with percentages summing to 100
5. Developer track record: completed projects, dates, unit counts, photos
6. Legal: sales terms, reservation terms, privacy policy, disclaimer text
7. Brand assets: logo in SVG, any existing colour or type direction
8. WhatsApp business number and the sales team email list


---

## 8. 3D systems

### 8.1 Layering strategy

Four distinct 3D features with different costs and different fallbacks. They must degrade independently — if WebGL is unavailable, the site still sells.

| Feature | Technology | Payload | Fallback |
|---|---|---|---|
| F8 Depth parallax | WebGL shader on a plane | +80KB depth map | Static image |
| F9 Virtual tour | Equirect panoramas, PSV | 400KB first view | Gallery of flat images |
| F11/F12 Interactive video | AVIF frame sequence | 1–3MB per ladder | Poster + play-through MP4 |
| F14 Building selector | glTF in R3F | ≤5MB | The SVG elevation stack (§2.5) |
| F17 Splat scene | Spark + `.spz` | ≤25MB | Panorama tour |

Detect with a single capability probe at mount and store in context:

```ts
const caps = {
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  memory: (navigator as any).deviceMemory ?? 4,
  saveData: (navigator as any).connection?.saveData ?? false,
  effectiveType: (navigator as any).connection?.effectiveType ?? '4g',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};
// heavy3d enabled only when: webgl2 && memory >= 4 && !saveData && effectiveType === '4g'
```

### 8.2 Virtual tour (F9)

```tsx
// components/tour/TourViewer.tsx  — client only
import { Viewer } from '@photo-sphere-viewer/core';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
```

Requirements:
- Node graph built from the API response, not hardcoded. Adding a scene in the admin must appear in the tour with no deploy.
- **Tour panoramas follow the global time state.** Switching from day to night inside the tour crossfades the panorama texture without resetting the camera yaw/pitch. This is the feature that makes the tour feel connected to the rest of the site.
- Adaptive tiling: load the 512 level immediately, upgrade to 1024 then 2048 for the current view direction only.
- Prefetch the target scene's preview on hotspot hover or focus.
- Hotspot kinds render differently: `NAVIGATE` is a bronze floor-anchored disc, `INFO` is a small dot that expands to a card, `VIEW_OUT` opens the view simulator (§8.6), `MEASURE` draws a dimension line.
- Floor plan minimap: the typology's SVG plan with a rotating cone showing the current camera direction, updated from the viewer's `position-updated` event. Clicking a room jumps to the nearest scene.
- Exit control that returns to whatever section the visitor came from.

### 8.3 Interactive floor plans (F10)

Floor plans must be **SVG with semantic room paths**, not raster images:

```svg
<svg viewBox="0 0 1200 900">
  <g id="rooms">
    <path id="room-living" data-scene-key="living" data-area="34.2" d="..."/>
    <path id="room-kitchen" data-scene-key="kitchen" data-area="12.8" d="..."/>
  </g>
  <g id="dimensions">...</g>
  <g id="furniture" data-layer="staging">...</g>
</svg>
```

Behaviours: hover highlights the room and shows its area; click enters the tour at `data-scene-key`; a toggle shows/hides the `furniture` layer; the plan rotates to match the unit's actual orientation with a north arrow.

If the architect only delivers PDF, vectorise once with Inkscape and hand-label the paths. Budget half a day per typology — it is worth it, and a raster plan kills every interaction in this section.

### 8.4 3D building selector (F14)

- Source: architect's model, decimated in Blender to ≤80k triangles.
- **Each sellable unit must be a separately named mesh** matching `Unit.meshName` (e.g. `unit_08B`). Establish this naming convention with the modeller before export — retrofitting it is painful.
- Bake lighting to a lightmap in Blender for each of the four time states; swap the lightmap texture on time change rather than moving real lights (far cheaper on mobile GPUs).
- Export glTF with Draco geometry compression and KTX2/Basis textures. Target ≤5MB total.
- R3F implementation: one `<Instances>` for unit volumes, raycasting against invisible simplified boxes rather than the display geometry.
- Camera: constrained orbit (no roll, limited polar angle, clamped zoom). `OrbitControls` from drei with `enablePan={false}`.
- Selection state is shared with the SVG elevation stack — selecting a unit in either updates both.

### 8.5 Interactive video (F11, F12)

**Why frame sequences and not a `<video>` element:** scrubbing a video element frame-accurately is unreliable across browsers, especially Safari on iOS, and seeking causes visible stalls. A preloaded image ladder gives deterministic frame control. This is the same approach Apple uses on product pages.

```tsx
// components/media/FrameSequencePlayer.tsx
```

Implementation:
1. Fetch the manifest, choose the ladder by viewport width and `deviceMemory`.
2. Preload frames into an `HTMLImageElement[]` in **priority order**: frame 0, then every 8th frame, then fill in. This gives a usable coarse scrub within ~600ms.
3. Draw the current frame to a `<canvas>` sized to `devicePixelRatio`.
4. Driver `scroll`: pin a container of `scrollHeightVh` (default 300vh), map scroll progress to frame index. Driver `drag`: map horizontal pointer delta to frame index with momentum.
5. Show a determinate loading bar while below 25% of frames are loaded.
6. **Hotspot layer (F12):** `FrameSequence.hotspots` maps frame ranges to screen-space regions and a unit id. As the sequence rotates, the overlay updates so a visitor can click a unit on the spinning building. Store as `{ unitId, frames: [{ i, x, y, r }] }` and interpolate between keyed frames.
7. Under `prefers-reduced-motion`, render frame 0 statically with a caption and no scroll pinning.

**Per-listing variant (F12):** each typology gets its own orbit of a cutaway model. Placed on the typology detail page above the floor plan. Hotspots here link to tour scenes rather than units.

### 8.6 Sun and view simulator (F15)

The differentiating feature. Given a selected unit:

1. `Floor.heightM` + `Unit.orientation` + the development's lat/lng give a real camera position and bearing.
2. `suncalc` computes sun azimuth and altitude for a chosen date and time.
3. Render the building model with a directional light at that angle, and show which facades are lit.
4. Overlay a compass rose and a horizon annotation naming what is visible in that direction (golf course, valley, city centre) from `Landmark` bearings computed in PostGIS.
5. Controls: a month slider and a time-of-day slider. The time slider is **bound to the global time state** so moving it also changes the site's palette — the two systems are one system.

Do not overclaim. Label it "Modelled sun position — actual views subject to construction." A simulator that promises a view is a legal problem.

### 8.7 Splat scenes (F17, Phase 5)

Only once something physical exists. Capture with a 360 camera walkthrough, train in Postshot, export `.spz`, render with `@sparkjsdev/spark` which provides LoD splat trees for large scenes on any device. Always behind an explicit "Enter immersive view" button. Never on first paint. Hard budget: 25MB initial view.

---

## 9. Phase plan

Each phase ends with acceptance criteria. **Do not begin a phase until the previous phase's criteria pass.**

### 9.0 Phase 0 pre-flight

Before writing the scaffold, the eight questions in §15 must be answered. Six of them change
the Prisma schema or the repo layout, and both are expensive to change after Phase 1 starts.
Do not scaffold around a guess — ask, record the answer in `docs/DECISIONS.md`, then build.

### Phase 0 — Foundation (Week 1)

Tasks:
1. Turborepo scaffold with all four apps and four packages.
2. Docker compose: Postgres 16 + PostGIS, Redis, MinIO.
3. Full Prisma schema from §4.1, migrated.
4. Seed script per §4.6, idempotent.
5. NestJS boots with health endpoints and pino logging.
6. Next.js boots with the design tokens from §2.3 wired and fonts self-hosted.
7. CI: typecheck, lint, unit tests, `pnpm audit --audit-level=high`, and a `NEXT_PUBLIC_*` secret grep, on every PR.
8. `DECISIONS.md` and `CONTENT_BRIEF.md` written.
9. `README.md` written — it is currently empty (§0.2). Must cover: what the project is, prerequisites, `docker compose up` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`, the ports from §3.3, and a pointer to this spec. A new engineer should reach a running site from a clean checkout without asking anyone.
10. `packages/types/format.ts` per §3.5, with unit tests, before any component renders a number.
11. `.env.example` committed with every key from §3.4 present and empty. CI fails if a key exists in `.env.example` but is unread by any app, or is read but missing from the example.

**Acceptance:**
- `pnpm dev` starts all apps.
- `GET /api/v1/development/seed-dev` returns a fully populated development.
- The web app renders a page that visibly changes colour across all four `data-time` values.
- A clean clone reaches a seeded running site following only `README.md`. Verify on a machine
  with no prior project state, or in a fresh container — not on the machine that wrote it.
- `pnpm build` succeeds for every app. A green `dev` with a broken `build` is not Phase 0 done.

### Phase 1 — Marketing site and lead engine (Weeks 2–6)

Tasks:
1. Public API endpoints per §5.3 (except tour, video, frames).
2. Admin app: auth, unit list, bulk status change, enquiry inbox, CSV export.
3. Section components: hero, narrative, residences, amenities, location, developer, faq, footer.
4. `ElevationStack` SVG component with filters and unit panel.
5. Enquiry form with Turnstile, phone normalisation, WhatsApp deep link.
6. Payment schedule calculator, frontend and backend, with tests.
7. Dual UI mode middleware and both route groups wired.
8. SEO: metadata per route, `RealEstateListing` JSON-LD, sitemap, robots, per-unit OG images generated at the edge.
9. Analytics events: `unit_viewed`, `unit_filtered`, `schedule_calculated`, `enquiry_started`, `enquiry_submitted`, `whatsapp_clicked`.

**Acceptance:**
- A sales user changes a unit's status in the admin and the public site reflects it within 60 seconds without a deploy.
- The payment schedule for every seeded unit sums to exactly the unit price. Automated test.
- Lighthouse ≥ 95 performance, ≥ 100 accessibility on `/` and `/availability`, mobile throttled.
- Both `?ui=single` and `?ui=multi` render the full content set correctly.
- An enquiry submitted from a unit panel arrives by email with the unit code in the subject and returns a working WhatsApp link.

### Phase 2 — Media pipeline and time system (Weeks 6–9)

Tasks:
1. Worker app with all queues from §5.8.
2. Presigned R2 upload flow, admin drag-drop with progress.
3. `media:variants` — sharp, AVIF + WebP at 6 widths, thumbhash, dominant colour.
4. `media:depth` — Depth Anything V2 ONNX, or ingest a supplied Z-depth pass.
5. `TimeStateProvider`, `TimedImage`, `TimeScrubber`, timelapse cycle mode.
6. `DepthParallax` shader component for the hero.
7. `video:encode` — ffmpeg HLS ladder + MP4 fallback + poster.
8. Admin media board showing missing time states per set, in red.
9. Gallery with time and kind filters, lightbox.

**Acceptance:**
- Uploading a 4096px render produces all variants, a depth map, and a thumbhash within 90 seconds, with no manual step.
- Moving the time scrubber changes background colour, type colour, accent and every visible image in one coordinated 1.2s transition, at 60fps on a mid-range Android.
- The hero parallaxes on pointer move with no visible edge tearing.
- Admin shows a red indicator for any `EXTERIOR` or `AERIAL` set missing one of the four states.
- With `prefers-reduced-motion`, the time change is instant and the parallax is disabled.

**Gate:** do not start Phase 3 until the pipeline handles panorama-scale files without timing out.

### Phase 3 — Virtual tour (Weeks 9–14)

Tasks:
1. `media:tile` — equirect → cube faces → 3 tile levels + preview.
2. Tour, scene, hotspot admin CRUD with a visual hotspot placer.
3. `TourViewer` per §8.2, including time-state panorama swapping.
4. SVG floor plan ingestion and the `PlanMinimap` with camera cone.
5. Room-click-to-scene and scene-to-room bidirectional linking.
6. Tour entry points from unit panel, typology page, and gallery.
7. Keyboard navigation mode and the text alternative.
8. Multi-page mode gets `/tour/[slug]` routes with per-tour metadata.

**Acceptance:**
- On throttled 4G, a tour scene shows a recognisable preview within 1 second and reaches full resolution within 4.
- Navigating between scenes never shows a blank frame.
- Switching time state inside the tour preserves camera direction.
- A keyboard-only user can enter the tour, move between all scenes, and read every hotspot.
- Adding a scene in the admin appears in the live tour without a deploy.

### Phase 4 — Interactive 3D (Weeks 14–19)

Tasks:
1. `media:frames` — frame sequence ladders and manifests.
2. `FrameSequencePlayer` with scroll and drag drivers, hotspot overlay.
3. Building orbit sequence integrated into the availability section.
4. Per-typology orbit on typology detail pages.
5. `WalkthroughPlayer` with chapter navigation and tour hand-off links.
6. R3F building selector per §8.4 with lightmap swapping per time state.
7. Sun and view simulator per §8.6.
8. Capability detection and every fallback path tested by forcing each condition.

**Acceptance:**
- Frame sequence reaches interactive coarse scrubbing within 800ms on 4G.
- Clicking a unit on the rotating building opens the correct unit panel.
- Stopping the walkthrough in the kitchen and pressing "Explore this room" opens the tour at the kitchen scene.
- The building selector holds 30fps on a mid-range Android, and falls back cleanly to the SVG stack with WebGL disabled.
- Sun simulator output matches an independent `suncalc` calculation for three spot-checked dates.

### Phase 5 — Immersive and AI (Weeks 19–24)

Tasks:
1. Splat scene ingestion and the Spark viewer behind an explicit entry button.
2. Virtual staging: TRELLIS.2-generated furniture GLB library, toggle inside the tour.
3. AI concierge — **deterministic engine plus narration layer only**:
   - Intent parsing extracts structured filters (beds, budget, orientation, view, availability).
   - A real Prisma/PostGIS query returns exact rows.
   - The LLM receives only the query result and writes prose about it.
   - **The model never produces a number.** Prices, areas, dates and availability are rendered from the structured result by the UI, not by the model. Enforce with a post-check that rejects any model output containing a digit not present in the result set.
4. Concierge hands off to the enquiry form with units pre-selected.

**Acceptance:**
- Asking for "two bedrooms under $150,000 with a golf view, available now" returns exactly the units a direct database query returns. Tested against 20 fixture queries.
- The concierge cannot be induced to state an incorrect price under adversarial prompting. Include a red-team test suite.
- Splat scene never loads without an explicit click and never exceeds 25MB initial.

### Phase 6 — Ongoing

1. Construction progress timeline with dated media and per-quarter splat scenes.
2. Tour analytics dashboard for the developer: most-toured units, drop-off points, typology conversion.
3. Quarterly progress email generation from `ProgressUpdate` records.

---

## 10. Testing and quality

| Layer | Tool | Coverage target |
|---|---|---|
| Domain logic (pricing, status transitions) | Vitest | 100% of `pricing` and `inventory` services |
| API contracts | Supertest | Every public endpoint, happy + error path |
| Component | Vitest + Testing Library | All interactive components |
| E2E | Playwright | 8 critical journeys (below) |
| Accessibility | @axe-core/playwright | Every route, all four time states |
| Performance | Lighthouse CI | Budgets from §6.6 |
| Visual regression | Playwright screenshots | Hero and elevation stack, four time states each |

**Critical journeys to E2E:**
1. Land → browse availability → open a unit → calculate schedule → submit enquiry
2. Land → residences → typology → tour → navigate three scenes → exit
3. Switch UI mode single ↔ multi, verify content parity
4. Move the time scrubber through all four states, verify images and tokens change
5. Filter availability by typology and price, verify counts against the API
6. Walkthrough video → chapter jump → hand off to tour
7. Admin: change unit status → verify public site updates
8. Keyboard-only completion of journey 1

### 10.1 Field monitoring

Lighthouse CI (§6.6) is a lab measurement on one synthetic device. It proves a regression did
not land; it does not prove real buyers get the experience the budgets promise.

- Ship `web-vitals` and report LCP, INP, CLS to the analytics endpoint with the route, the UI
  mode, the active time state, and whether heavy 3D was enabled.
- Review p75 field values weekly. **The p75 field number is the real budget**, the lab number
  is the guard rail. If lab passes and field p75 fails, field wins and the budget is missed.
- Alert on: p75 LCP > 2.5s over 24h, INP > 200ms over 24h, JS error rate > 0.5% of sessions.
- Track the fallback rates too — what share of sessions get the SVG stack instead of the 3D
  selector, the poster instead of the frame sequence. If a fallback is firing for most
  visitors, the heavy path is decoration and its budget should be re-argued (§14, R4).

---

## 11. Deployment and operations

**Build order:** `packages/db` → `packages/types` → `apps/api` → `apps/worker` → `apps/web` → `apps/admin`.

**Migrations** run in a release step before the API deploys. Never `prisma db push` in production.

**ISR revalidation:** the API calls `POST {WEB_REVALIDATE_URL}` with the secret and affected paths on any content or inventory change. The web app's route handler calls `revalidatePath`.

**Caching layers:**
1. Cloudflare edge — static assets, images, immutable media (1 year, content-hashed keys)
2. Next.js ISR — pages, 1 hour, revalidated by webhook
3. Redis — the inventory query, 30 seconds
4. Client — `/inventory/live` polled at 60 seconds

**Monitoring:** Sentry on both apps. Uptime check on `/health/deep`. Alert if the media job queue depth exceeds 50 or any job has failed three times.

**Backups:** daily Postgres dump to R2, 30-day retention. R2 media is the source of truth for assets; keep originals forever, derivatives are reproducible.

**Launch checklist:**
- [ ] All `MediaSet` time states populated, admin board fully green
- [ ] Payment percentages sum to 100
- [ ] Every unit has a typology, area, price, orientation
- [ ] Legal pages present: sales terms, reservation terms, privacy, render disclaimer
- [ ] Render disclaimer visible wherever CG imagery represents a unit
- [ ] WhatsApp number tested end to end from a real device
- [ ] Enquiry emails arriving at all addresses on the notify list
- [ ] Sitemap submitted, OG images verified in the WhatsApp and LinkedIn preview tools
- [ ] Lighthouse budgets met on a real mid-range Android over a real mobile network
- [ ] Admin users created with TOTP enrolled

---

## 12. Explicit non-goals

Do not build these. If they are requested later they are separate projects:

- Public user accounts, saved favourites, or watchlists
- Online payment or reservation processing
- Agent or broker portals
- Multi-development or multi-tenant support
- A blog or CMS beyond the models defined here
- Native mobile apps
- Live chat staffed by humans
- Mortgage calculators tied to real lender rates

---

## 13. Legal and ethical constraints

This site sells property that does not exist yet. Two rules follow:

1. **Never let generative AI produce imagery that represents a specific unit.** Generative video and image models invent architecture — a hallucinated window or an extra metre of floor space is a misrepresentation, not a stylistic liberty. Anything dimensional about a sellable unit comes from the architect's model. Generative tools are permitted for atmosphere, context and furniture props only.
2. **Label CG imagery.** A persistent, readable disclaimer wherever renders appear: "Computer-generated image. Final finishes, layout and views subject to change." Not hidden in the footer.

The sun simulator, view claims, and travel times are all modelled estimates and must be labelled as such.

---

## 14. Risk register

The five things most likely to derail this build, with the trigger that says a risk has become
a problem. Review at the end of every phase.

| # | Risk | Impact | Trigger — act when this is true | Response |
|---|---|---|---|---|
| R1 | **Architect's model arrives late or without per-unit named meshes** (§8.4). Blocks Phases 3 and 4 entirely. | 5 weeks | Model not in hand by end of Phase 1, or a delivered model has merged geometry | Confirm the `unit_08B` naming convention with the modeller in **week 1**, not week 12. Retrofitting names is days of manual work. The SVG elevation stack (§2.5) is a genuine product on its own — ship Phases 1–2 without any 3D and treat F14 as additive. |
| R2 | **Renders are not camera-locked across the four time states** (§7.1). Any drift destroys the crossfade, which is the site's one bold move. | The concept | The first `hero-exterior` set shows any camera movement between states | Reject the set. Require the render team to deliver all four states from one saved camera in one scene file, and validate the first delivery by differencing the four images before commissioning the rest. |
| R3 | **Real content never arrives**; the site ships on seed fixtures. | Launch | Any `TODO(content)` marker still present entering the final phase | `docs/CONTENT_BRIEF.md` goes out **before Phase 1** (§7.8). Add a CI check that fails the production build if `TODO(content)` appears in any rendered string. It must not be possible to launch with placeholder copy. |
| R4 | **Scope**: 19 features across 24 weeks, five of them individually large (tour, frame sequences, 3D selector, sun simulator, concierge). | Everything | Any phase overruns its window by more than a week | The phase order is already a priority order. Phases 0–2 are the sellable product; 3–5 are additive. Cut from the back, never from the acceptance criteria of a phase already started. |
| R5 | **Accessibility fails in dusk/night after the fact.** §2.3 fixes the palette and §6.5 demands 4.5:1 in all four states; those two can conflict, and the discovery usually comes late. | Rework | Any token pair fails contrast in any state | Write the contrast assertion as a **unit test over the token file in Phase 0**, before any component exists. If a pair fails, adjust the token then, when it costs nothing. Never fix it per-component with an override — that breaks the §2.3 cascade rule. |

---

## 15. Open questions — answer before Phase 0

Six of these change the schema or the repo layout. Ask; do not assume.

1. **Which development?** Real name, city, coordinates, unit count, floor count, handover date.
   If unknown, Phase 0 proceeds on the §4.6 fixtures — but the seed's 92 units / 10 floors is a
   placeholder, and §4.6's status distribution is fiction. Confirm which it is.
2. **Currency and locale** (§3.5). Drives every price string and the E.164 phone default.
3. **One building or several?** The schema supports `Development → Building[]`, but §2.5's
   elevation stack and every acceptance criterion assume one. Multiple buildings needs a
   building switcher that is not specified anywhere.
4. **Is the reservation legally binding online?** §12 excludes payment processing. If a
   deposit must be taken, that is a separate project with PCI scope — confirm it is out.
5. **Who operates the admin?** Number of users, roles beyond OWNER, and whether TOTP on
   personal phones is acceptable to the sales team (it often is not, and that changes §5.9).
6. **Hosting decision** (§3.3 lists alternatives). Vercel + Fly vs. a single VPS changes CI,
   the worker's deployment, and the ffmpeg/ONNX runtime availability. ONNX depth inference
   (§7.4) will not run on a small serverless container.
7. **Does the developer already have brand assets?** §7.8 item 7. If a brand book exists it may
   conflict with §2.3, and §2 is binding — that conflict is resolved by a human, not an agent.
8. **Analytics and consent.** Umami/Plausible are cookieless, so no banner (§3.1). Confirm no
   third-party pixel (Meta, Google Ads) will be added later — one pixel reintroduces the banner
   and the consent gate, which changes the layout of every page.

---

## 16. Definition of done

**Per PR**
- Typecheck, lint, unit tests, `pnpm audit --audit-level=high` green.
- Tests written alongside the code, not in a follow-up PR.
- No `any` without an adjacent comment justifying it (§0, agent rules).
- No new colour literal outside the §2.3 token block. Components read tokens; they never
  compute a colour from the time state.
- No `text-transform: uppercase` (§2.4). Enforce with a stylelint rule, not review discipline.
- Any decision the spec left open is recorded in `docs/DECISIONS.md` in the same PR.

**Per phase**
- Every acceptance criterion in §9 **demonstrated**, not asserted — a recording, a screenshot,
  or a test run in the PR description. "It works" closes nothing.
- Axe passes on every route in all four time states (§10).
- Lighthouse budgets (§6.6) met on the throttled mobile profile.
- No `TODO(content)` left in a rendered string for content that phase was meant to deliver.

**Before launch**
- Every box in §11's launch checklist ticked, plus §5.9's retention job verified to actually
  delete, plus §10.1's field monitoring live and reporting for at least one week.
