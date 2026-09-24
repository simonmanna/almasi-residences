import { formatDistance } from '@avida/types';

/**
 * How a nearby place's figures are worded, so the site never passes an
 * estimate off as a measurement: road routes are stated plainly, straight
 * lines say so and their times carry "≈", and figures the admin typed are
 * shown as given.
 */
type Measured = { distanceM: number | null; driveMinutes: number | null; walkMinutes: number | null; routed?: boolean; manualDistance?: boolean };

const estimated = (l: Measured) => !l.routed && !l.manualDistance;

/** "2.1 km by road" · "1.4 km straight-line" · "1.4 km" (typed). */
export function distanceText(l: Measured): string {
  if (l.distanceM === null) return '';
  const d = formatDistance(l.distanceM);
  if (l.routed) return `${d} by road`;
  return l.manualDistance ? d : `${d} straight-line`;
}

/** "6 min by car" · "≈ 3 min by car". */
export function driveText(l: Measured, unit = 'by car'): string {
  return l.driveMinutes ? `${estimated(l) ? '≈ ' : ''}${l.driveMinutes} min ${unit}` : '';
}

/** "12 min on foot" · "≈ 9 min on foot". */
export function walkText(l: Measured, unit = 'on foot'): string {
  return l.walkMinutes ? `${estimated(l) ? '≈ ' : ''}${l.walkMinutes} min ${unit}` : '';
}
