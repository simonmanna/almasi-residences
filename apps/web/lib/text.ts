/**
 * Splits a heading from the CMS into the two lines the display type is set in,
 * breaking at the word nearest the middle. "Arrange a private viewing." →
 * ["Arrange a", "private viewing."].
 */
export function twoLines(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text.trim()];
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/** Capitalizes every word in display headings without changing existing casing. */
export function titleCaseHeading(text: string): string {
  return text.replace(/(^|[\s|])([\p{L}\p{N}])/gu, (_, boundary: string, character: string) =>
    `${boundary}${character.toLocaleUpperCase()}`,
  );
}
