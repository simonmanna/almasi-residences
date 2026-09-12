/**
 * Which residence codes the 3D building maquette can place.
 *
 * Roadmap §40.1 draws the line: the database owns the unit (code, floor,
 * position, width, status, price), the design system owns the architecture
 * (shell, slabs, lighting, materials). The one fact both sides need is whether
 * a given code resolves to a volume at all — so it lives here, once, rather
 * than being implied by a lookup table in the web app that silently returns
 * nothing.
 *
 * Before this existed, `unitVolumes()` returned an empty array for an
 * unrecognised code and the residence simply vanished from the building with no
 * error anywhere. A missing visual is now a surfaced warning in the admin, never
 * a silent disappearance.
 */

/** Letters the typical floor plan (levels 1 and up) can place. */
export const MODEL_TYPICAL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** The ground floor gives its south face to reception and co-working, so it holds fewer. */
export const MODEL_GROUND_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Penthouses are placed by their whole code, not by a letter. */
export const MODEL_PENTHOUSE_CODES = ['PH-A', 'PH-B', 'PH-C'] as const;

/** `A1` → `A`, `PH-A` → `PH-A`. Trailing digits are the floor, not the position. */
export function unitCodeLetter(code: string): string {
  return code.trim().toUpperCase().replace(/\d+$/, '');
}

/**
 * Can the maquette draw this residence? `false` means the admin must say so:
 * the residence is still for sale, still listed and still has its own page —
 * it just has no volume in the 3D view until someone adds one.
 */
export function isPlacedInModel(code: string, level: number): boolean {
  const c = code.trim().toUpperCase();
  if ((MODEL_PENTHOUSE_CODES as readonly string[]).includes(c)) return true;
  if (level < 0) return false;
  const letters: readonly string[] = level === 0 ? MODEL_GROUND_LETTERS : MODEL_TYPICAL_LETTERS;
  return letters.includes(unitCodeLetter(c));
}

/** Human sentence for the admin warning, so the wording is the same everywhere. */
export const UNPLACED_IN_MODEL_NOTE =
  'This residence has no volume in the 3D building, so it is missing from that view on the website. Its page, the elevation and every list still show it.';
