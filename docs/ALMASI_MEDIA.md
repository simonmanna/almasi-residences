# Almasi Residence — media provenance and what is still needed

Every image and film on the site is CG. This file records where each one came
from, so the sales team can answer "is that the real building?" precisely, and so
each concept visual can be replaced by an architect's render when one exists.

Renditions live in `apps/web/public/media/almasi/`, are described in
`apps/web/lib/media-data.json`, and are labelled on the page from
`apps/web/lib/media-manifest.ts`.

## Rebuilding

```bash
node scripts/media/build-almasi-media.mjs <masters-dir>      # stills, clips, blur placeholders, OG image
node scripts/media/render-almasi-film.mjs .claude/skills/ui-styling/canvas-fonts   # the film + chapters
```

A masters directory holds one file per scene id (`street.png`, `street.mp4`, and
an empty `street.reverse` to play that clip backwards). Video uses the worker's
Docker image for ffmpeg when none is installed.

## Supplied by the developer (retouched)

The five renders supplied on 2026-09-11 (`1real.png` … `5real.png`) carried logos,
titles and information bars. Each was retouched with Higgsfield GPT Image 2 to
remove that text and extended to 16:9. Architecture, furniture and lighting were
kept; small details can differ from the originals.

| Scene | From | Higgsfield job |
|---|---|---|
| `street` | exterior from KG 15 Ave (1real) | 8c0fff5c-383e-44bf-a19b-5739b4fa3ab3 |
| `arrival` | porte-cochère (5real) | 2a20632b-aed8-43e4-b7e7-3ef3ef6136cc |
| `living-2br` | two-bedroom living (4real) | cf5c71db-8215-4423-850a-47df57fdd74f |
| `ph-living` | penthouse living (3real, top) | 3855c537-0fd6-45e9-9236-7cd180801bfc |
| `ph-bedroom` | penthouse master (3real, bottom left) | 84c59f2d-ad02-4180-8a9c-f47fa0d1b2c9 |
| `ph-terrace` | penthouse roof terrace (3real, bottom right) | 221aa59d-485f-4855-a840-57b5002f95c0 |
| `one-living` | one-bedroom living (2real, top) | 8544577f-10c0-43f0-8327-1828c403bdf0 |
| `one-bedroom` | one-bedroom bedroom (2real) | 16679532-8eeb-4123-940c-93939fc1c9df |
| `one-kitchen` | one-bedroom kitchen (2real, cropped, not retouched) | — |
| `ph-kitchen`, `two-kitchen`, `view` | crops of the scenes above | — |

## Concept visuals (generated — replace first)

Generated with GPT Image 2 using the supplied renders as style references. They
show plausible spaces in the building's visual language; they are not the design.

| Scene | Replace with |
|---|---|
| `lobby` (58a60080-7b6b-42ff-8fac-e13e0d0d4447) | Reception render, 24 mm from the entrance |
| `pool` (2b6eed3c-07d1-48c7-810f-a0b35cd111c4) | Amenity deck and pool, dusk |
| `restaurant` (bddc6f46-fb9e-4fc0-b5d8-524ee7e3756a) | Restaurant interior |
| `gym` (f7d6900b-b278-4e06-9694-99c00937c5e2) | Gym interior |
| `wellness` (18e12301-3d98-459e-8362-9d2f5c8af28d) | Sauna and massage room |
| `cowork` (fdad60de-c32f-4ccb-aa5c-cbbc172faa1b) | Co-working room |
| `ph-bath` (f0491d35-d784-4e4b-af0b-1846424e4bb9) | Master en-suite (used for every type) |
| `parking` (140b246c-5097-4616-bef0-821ed0525cc5) | Basement car park |
| `aerial` (5e6f0ed2-8a54-44de-913c-56158f793295) | Drone photograph of the site, or an aerial render |
| `plan-1br`, `plan-2br`, `plan-ph` (6f1b8b06…, 6092b5e2…, 2dbc15f0…) | Architect's furnished plans per type |

## Motion

Image-to-video from the scenes above, 5 s each at 720p, silent.

| Scene | Model | Job | Note |
|---|---|---|---|
| `street` | Kling 3.0 | 1a710921-a1d7-4409-ba18-a69418f6a1ed | the hero; its first frame is the still, so the hand-over is seamless |
| `aerial` | Kling 3.0 | d680d0db-4fdd-41dd-a8a3-5cd7d2adffa8 | |
| `arrival` | Kling 3.0 | 58dec368-93c9-426a-86d4-0ee5409712ed | |
| `lobby` | Kling 3.0 | 169872be-6237-48f1-9cd9-b42f5ab2ff81 | |
| `pool` | Kling 3.0 | c06585e3-bc21-4253-8dc7-ff2f5aaa9b68 | |
| `ph-terrace` | Kling 3.0 | e891f850-4153-4bb4-b051-1da1a9031cc0 | |
| `living-2br` | Cinema Studio v2 | be37be74-a459-4433-85bf-90279c3ab1d2 | very little camera movement |
| `ph-living` | Cinema Studio v2 | 6c2072b3-94a7-4936-a26c-afbfa9aa2209 | trimmed to 2.6 s — the rest invents a skyline |
| `ph-bedroom` | Cinema Studio v2 | 19f03da3-487e-4508-ad6a-59791918270c | |
| `one-living` | Cinema Studio v2 | 04986b4d-6123-4414-ad59-b8dc0e6c0f50 | |

## Still needed from the architect or visualiser

1. **A building model** (glTF/GLB, ≤ 80k triangles) with each residence as a mesh
   named `unit_<code>` — replaces the procedural maquette in the 3D explorer.
2. **Dimensioned floor plans** for each residence type (PDF or SVG) — replace the
   indicative plan drawings on residence pages.
3. **Renders of every concept scene above**, at 16:9, 3840 px, dusk to match.
4. **A daylight exterior** and **a street-level night view** for variety.
5. **Drone footage or 360° panoramas** once the site allows — the tour is built to
   take real footage in place of the generated clips.
6. **Confirmed prices**; the seed prices are illustrative (see `packages/db/prisma/seed-data.ts`).
