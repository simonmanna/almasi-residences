# Almasi 3D Design

Open `/3d-design`. The main navigation and the homepage's "The Building" section link to it.

## What it shows

One building, drawn twice from one description:

| View | Where | What draws it |
| --- | --- | --- |
| The 3D Design page | `/3d-design` | `components/digital-twin/engine/Engine.ts`: sky, site, the building, the furnished penthouse tour |
| The 3D model tab | Homepage "The Building", and `/residences` → 3D building | `components/explore/Building3D.tsx`: the same building, lit for dusk, with every residence tinted by its status |

Both call the same `Building` class (`components/digital-twin/engine/building.ts`), which draws what
`lib/building-model.ts` describes. Change the building there and both views change.

## Where the design comes from

`real-estate-design/ALMASI RESIDENCES update.pdf` — eight sheets: basement and ground site plans, then the
basement, ground, first, typical second-to-third, fourth and roof plan layouts.

`lib/building-model.ts` enters the plans as they are dimensioned: `u` metres east of grid line A, `v` metres
north of grid line 1 (the street side). `planRect` in `@avida/types` turns those into the model's own grid (x east,
z south toward the street, origin in the middle of the building).

| From the plans | In the model |
| --- | --- |
| Footprint about 28 m × 33.5 m on a 5 × 6 column grid | `FOOTPRINT`, each level's `plate` |
| Lift and stair core; atrium void under a glass skylight | `CORE`, `ATRIUM`, `GALLERY`, `ROOF_PLAN.skylight` |
| Every outside wall and its windows, by position and width (the window schedule) | each level's `walls` and their `openings` |
| Balconies: 1.8–2.1 m to the street, 1.5 m to the north, 1.4 m to the east, inset on the west | each level's `balconies`, and `recess` on a west opening |
| Fin screens on the west face and by the south-east kitchens | each level's `screens` |
| Ground floor: reception under a curved canopy, co-working, residents' meeting room, pool terrace, lap pool | `PARTS`, `POOL`, `CANOPY` |
| Basement: 14 parking bays, staff rooms, sauna and massage, gym | `parkingBays`, `PARTS` |
| Roof: slab and parapet, stair overrun, skylight | `ROOF_PLAN` |
| Plot, access drive down the east side, 4 m road reserve, 11.4 m road | `PLOT`, `DRIVE`, `STREET` in `engine/landscape.ts` |

### What the plans do not hold

The PDF has no elevations and no sections. These are the model's own, and should be replaced when the
architect supplies them:

- **Storey height** — `FLOOR_H` (3.4 m). Window heads are drawn at the full storey; the schedule gives 3.0 m.
- **Facade finishes and colour** — white plaster, walnut panels, glass balustrades and the rounded frames on the
  street face follow the supplied exterior render (`public/media/twin/exterior.png`), not a drawing.
- **The name on the roof, the pergola over the east penthouse terrace, planting and furniture** — illustrative.
- **Interior partitions** — an opened floor shows a generic furnished layout inside each home's real outline,
  not the rooms the plans draw.

### Residences and the plans

The inventory's codes keep their meaning; `packages/types/src/building.ts` places each on the plan nearest in
kind and size (the admin can still override a residence's position, and is offered exactly these volumes):

| Floors | Code → plan |
| --- | --- |
| Ground | A west 1-bed (70 m²) · B east 1-bed (81 m²) · C north-west (122 m²) · D north-east (134 m²) |
| 1–3 | A west (70 m²) · B east, south of centre (71 m²) · C east, north of centre (81 m²) · D south-east (130 m²) · E north-east (134 m²) · F south-west (140 m²) · G north-west (122 m²) |
| 4 | PH-A south-east (174 m²) · PH-B north-east (224 m²) · PH-C west and south (376 m²) |

The areas in brackets are the plans'. The inventory's own areas differ by a few square metres in places, and
the plans draw fourteen basement bays against twenty-eight residences; both are questions for the sales team,
not something the model settles.

## The engine

Procedural three.js: no model file is downloaded. Geometry is merged into one mesh per material per level, so
a floor can lift away and fade on its own.

- **Light** — a painted sky (a three-stop gradient, a wash of light around the sun, slow clouds; `DOME_FRAGMENT`
  in `engine/atmosphere.ts`), a sun with PCF shadows, ACES tone mapping, environment reflections from a physical
  sky, ambient occlusion and bloom. The hills fade into a haze the colour of the sky's foot, and the city's lights
  come on with the lamps. Day, sunset and night cross-fade over about two seconds; each hour's colours are one
  entry in `PRESETS`.
- **Camera** — an opening fly-in, a damped orbit that carries on after a drag and settles, eased flights between
  places and floors. `prefers-reduced-motion` makes every move immediate.
- **Quality** — `high` or `lite`, chosen from the device (`detect()` in `DigitalTwin.tsx`); integrated GPUs start
  on `lite`. While frames stay slow the engine steps down: ambient occlusion, then resolution, then shadow
  detail, then bloom. Pixel ratio never exceeds 1.75. `?quality=lite` or `?quality=high` forces one.
- **Loading** — the engine is a dynamic import. Until it is ready the stage shows `public/media/twin/poster.jpg`,
  a still of this model, under the progress mark; the stage has a fixed height, so nothing shifts.
- **Leaving** — geometry, materials, textures and the renderer are disposed when the page unmounts.

Two sets of pictures are stills of this model and go stale when the building or the light changes:
`public/media/twin/poster.jpg` (the opening view, 1600 × 900) and `public/media/twin/places/*.jpg` (one per
destination in the dock, 480 × 320). To refresh them, open `/3d-design?quality=high`, hide the interface, visit
each place and save the frame.

`public/models/almasi/*.glb` and `blender/` belong to an earlier version of this page and are not loaded.
A residence can still be given its own GLB interior: set `model` on its scene in `lib/digital-twin.ts`.

## The page

`DigitalTwin.tsx` and `DigitalTwin.module.css`. The page wears the site's Blue theme whatever the admin chose
for the rest of the site: `<main data-theme="blue">` around a `data-ground="night"` element, so every colour in
the stylesheet is one of that ground's tokens from `styles/themes.css`, or a `color-mix` of them. To have the
page follow the admin's theme instead, remove `data-theme="blue"` from `<main>`. Below 768 px the site's
phone dress (`styles/mobile.css`) applies here as everywhere.

The stage is composed like a film frame: the title names where the visitor stands, the edges darken so type
and controls sit on the scene without panels of their own, and the dock is a strip of stills, one for each
place to go. The residence list starts closed so the building is first seen whole, and opens when a floor is
chosen. A selected residence shows under a render of its kind of home (`TYPE_IMAGE`, from the site's own media).
The opening is the one authored moment: the scene develops out of the poster, the title settles, then the
controls arrive in turn; `prefers-reduced-motion` removes all of it.

Deep links: `?residence=e2` opens onto that home; `&tour=1` walks straight in.

The furnished interior is one reference penthouse design, shown as a preview for every residence and labelled
as such on the page. It is not the plan of any home in the PDF.

## Verification

```bash
pnpm --filter @avida/types build
pnpm --filter @avida/web typecheck
pnpm --filter @avida/web test                 # tests/building-model.test.ts, tests/digital-twin.test.ts
node scripts/verify-digital-twin.cjs          # needs the web server and the API running
```

`tests/building-model.test.ts` holds the model to the plans' outline: every residence stands on its floor
plate, inside the footprint and clear of the atrium and its neighbours; every window sits inside its wall.

The browser check loads the page, changes the hour, orbits, visits each place, opens a floor, selects a
residence, walks the tour, checks 375 px for sideways scroll and checks the no-WebGL fallback. It prints the
frame rate it saw and writes screenshots to `test-results/digital-twin/`. `E2E_WEB_URL` points it at another
server; `E2E_CHANNEL=chrome` uses the installed Chrome instead of Playwright's Chromium. It does not submit an
enquiry.

First-party analytics receive `tour_started`, `residence_viewed`, `floor_plan_viewed` and `filter_applied`.
Other interactions emit `window` CustomEvents named `almasi:3d` with `{ action, … }`.
