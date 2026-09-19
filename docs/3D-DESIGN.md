# Almasi 3D Design

Open `/3d-design`. The main navigation and homepage Explore Almasi section link to it.

## What is implemented

- A client-loaded Three.js showroom within the existing Next.js application.
- Blender-authored exterior, landscaped site and pool, reception, and one connected, furnished two-bedroom reference home.
- Packed stone, timber and fabric textures, glass, emissive light fittings, environment reflections, directional shadows and local interior lighting.
- Orbit, zoom, eased camera transitions, walking with WASD/arrow keys, swipe-to-look and touch movement buttons.
- Collision boundaries for the site, pool, apartment walls and main furniture; room shortcuts and gold floor hotspots.
- Floor filtering, residence highlighting and selection using the existing `InventoryProvider`, `unitVolumes`, model slots and live status polling.
- Day/sunset/night, light toggle, oak/walnut finish selection, exterior floor separation and interior ceiling cutaway.
- Keyboard-accessible SVG floor plan, room buttons, dialogs, mobile residence sheet and breadcrumbs.
- Existing enquiry dialog with the selected residence ID, label and summary. Selecting a reference home alone does not invent a residence ID.
- Reference image gallery on request, loading progress, and automatic fallback for WebGL creation/context/model errors.

## Asset pipeline

From the repository root, in PowerShell:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python blender/scripts/build_digital_twin.py
```

The deterministic script creates:

| Editable source | Browser export |
| --- | --- |
| `blender/exterior.blend` | `apps/web/public/models/almasi/exterior.glb` |
| `blender/reception.blend` | `apps/web/public/models/almasi/reception.glb` |
| `blender/residence.blend` | `apps/web/public/models/almasi/residence.glb` |

Helpers accept metres in Three.js X/Y-up/Z coordinates. Blender coordinates are converted on export. The exterior follows the existing maquette's 38m width and 3.4m floor spacing. Mesh names preserve `Floor_N` and `Ceiling` semantics. Geometry is merged by level/material to reduce draw calls. Textures are embedded 256px PNGs. No external model/CDN dependency is required.

The exterior is about 4.9 MB, residence about 1.5 MB, and reception about 0.5 MB. Only the requested scene loads; visited scenes are reused until the viewer unmounts. Rendering caps at roughly 30fps, pauses drawing in hidden tabs, caps pixel ratio and drops resolution/shadows after sustained slow frames. GPU resources are disposed when switching to the gallery or leaving the page.

Each editable `.blend` also includes a composed camera, golden-hour sun, world illumination and interior area lights, with Cycles denoising configured. These are authored by `blender/scripts/presentation.py`; browser lighting is managed separately. Open a source in Blender and use Render Image to produce a still.

`connect-src blob:` is required in the existing CSP because Three.js fetches embedded texture blobs before decoding them.

## Code and data

- `apps/web/lib/digital-twin.ts`: room destinations, default state, scene asset mapping, collision boundaries.
- `apps/web/components/digital-twin/TwinEngine.ts`: scene streaming, rendering, picking, cameras, movement, lighting and disposal.
- `apps/web/components/digital-twin/DigitalTwin.tsx`: inventory, navigation, fallback, dialogs and enquiries.
- `apps/web/components/digital-twin/DigitalTwin.module.css`: page and responsive styling.

When changing geometry, update corresponding room cameras and collision rectangles, then run the navigation tests. The tests assert that every room's camera starts in a walkable position and doorways remain passable.

Existing first-party analytics receive `tour_started`, `residence_viewed`, `floor_plan_viewed`, `filter_applied` and the enquiry provider's existing events. Additional interactions emit `window` CustomEvents named `almasi:3d` with `{ action, place, room, residence }`. These additional hooks do not automatically persist to the backend's event allowlist.

## Important scope

The model is an architectural interpretation of the supplied renders and existing maquette, **not a surveyed digital twin or approved sales plan**. Every residence selection currently opens the same explicitly labeled reference interior. The plan, garden, material choices and skyline are illustrative. Sizes and availability come from inventory, not the model. Do not use the reference model to make dimensional or fit-out promises.

This is a real navigable model, but its current procedural furniture and materials are not equivalent to a photorealistic, professionally baked architectural visualization. Lighting is real-time; there are no baked GI maps or measured site context. The next asset-quality step is approved architectural geometry, residence-specific interiors, authored furniture, higher-resolution PBR maps and baked lighting. The scene loader/data separation supports replacing GLBs without replacing the page.

Interiors stream as separate scenes with camera transitions; they are not all physically assembled inside the exterior. Walking is confined to the active scene. Gallery fallback uses the supplied design references, not 360° panoramas or room-specific photographs. No production deployment is performed by the generation script.

## Verification

```powershell
pnpm --filter @avida/web typecheck
pnpm --filter @avida/web exec vitest run tests/digital-twin.test.ts
node scripts/verify-digital-twin.cjs
```

The browser check expects the web server at `http://localhost:3000` (override with `E2E_WEB_URL`). It checks the navigation journey, lighting controls, walking input, clickable floor plan, cutaway, amenities, gallery GPU teardown and mobile sheet. Screenshots are written to `test-results/digital-twin/`. It does not submit a sales enquiry.
