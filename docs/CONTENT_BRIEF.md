# Content brief — what the developer must supply

Send this before Phase 1 (§7.8). Items are ordered by what blocks the most work.
Everything the site shows today is placeholder and marked `TODO(content)`; a
production build will be made to fail on those markers before launch (risk R3).

---

## 1. Architect's 3D model — **blocks Phases 3 and 4**

Revit, 3ds Max, SketchUp or native Blender. One requirement to settle **now**,
in writing, with the modeller:

> **Every sellable unit must be a separately named mesh**, named `unit_<code>` —
> `unit_8B`, `unit_PH_A`. Merged floor geometry cannot be split afterwards
> without days of manual work (risk R1).

Also needed: storey heights, true north, and the site's survey coordinates.

## 2. Approved floor plans, as vector — **blocks Phase 3**

PDF or DWG per typology, dimensioned. Not a raster export: the plans become
interactive SVG with named room paths (§8.3), and a raster plan kills every
interaction in that section. If only PDF exists, budget half a day per typology
to vectorise and hand-label.

## 3. The unit schedule — **blocks real inventory**

One row per unit: code, floor, typology, internal area m², balcony area m²,
orientation, current status, price. A spreadsheet is fine. This replaces the 92
fictional units the site currently shows.

## 4. Payment milestone structure

Label, percentage and trigger for each milestone. **Percentages must sum to
exactly 100** — the API rejects anything else (§5.6). For each milestone say
whether it is triggered by reservation, signing, a fixed date, a construction
stage, or handover. Construction-stage milestones need the wording to display
where a date would otherwise go ("On completion of the roof slab").

## 5. Renders — **the site's quality ceiling** (§7)

The single most important item. For each view in the §7.1 matrix, the **same
camera at four times of day** — same position, same lens, same composition, only
the light changes. Any camera drift between the four destroys the crossfade,
which is the site's one distinguishing move (risk R2).

- Sun angles per state are specified in §7.2. Give them to the render team as
  numbers, not adjectives.
- Tone-map the four states with one LUT. Do not grade them independently: they
  must read as one day, not four photographs.
- Deliver 16-bit EXR masters plus PNG at 4096px on the long edge.
- If the renders are CG, **export a Blender Z-depth pass alongside each beauty
  render** — dramatically better than an inferred depth map (§7.4).

**Validate the first set before commissioning the rest**: difference the four
images and confirm only the lighting moved.

## 6. Panoramas and video (Phases 3–4)

- Equirectangular panoramas, 8192×4096, camera at 1.6 m, level, no roll, clean
  nadir and zenith (§7.5).
- Building orbit: 120 frames, full 360°, stable subject (§7.6).
- Walkthrough: one continuous 60–90 s path through a typology, no cuts, no music,
  with room-boundary timecodes (§7.7).

## 7. Developer track record

Completed projects: name, location, completion date, unit count, photography.
Plus any delivery guarantees, escrow arrangements or warranties — this is the
answer to "can I trust you to build it" (§1.2).

## 8. Legal text

Sales terms, reservation terms, privacy policy, and the render disclaimer wording
if it must differ from §13's. The privacy policy must state the enquiry retention
period (24 months), who receives enquiry notifications, and that the WhatsApp
hand-off moves the conversation to Meta's platform (§5.9).

## 9. Brand assets

Logo as SVG, plus any existing colour or type direction. **If a brand book
exists, send it before Phase 1**: §2 of the specification is binding and may
conflict with it, and that conflict is resolved by people, not by the build.

## 10. Operational details

- WhatsApp business number, tested from a real device.
- Sales team email addresses for enquiry notifications.
- Who operates the admin, how many people, and whether TOTP on personal phones
  is acceptable (§15 Q5).
- The development's real name, city, coordinates, unit count, floor count and
  handover date (§15 Q1) — everything currently on the site is invented.
