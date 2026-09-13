import { fillCopyTokens, formatCount } from '@avida/types';
import { RESIDENCE_TYPES, typesPresent, type ResidenceSummary } from './residences';

/**
 * The live figures admin copy may name in braces (COPY_TOKEN_HELP in
 * @avida/types), from the same inventory summary every count on the site uses.
 */
export function copyTokenValues(summary: ResidenceSummary, extra: Record<string, string | null | undefined> = {}) {
  const values: Record<string, string | number | null | undefined> = {
    total: summary.total,
    available: summary.available,
    types: formatCount(typesPresent(summary).length || 1),
    ...extra,
  };
  for (const t of RESIDENCE_TYPES) {
    const s = summary.byType[t];
    if (s.total === 0) continue;
    values[`${t}.count`] = s.total;
    values[`${t}.countWords`] = formatCount(s.total).toLowerCase();
    values[`${t}.available`] = s.available;
    values[`${t}.areaMin`] = s.areaMin;
    values[`${t}.areaMax`] = s.areaMax;
  }
  return values;
}

export function fillCopy(text: string, summary: ResidenceSummary, extra?: Record<string, string | null | undefined>): string {
  return text.includes('{') ? fillCopyTokens(text, copyTokenValues(summary, extra)) : text;
}
