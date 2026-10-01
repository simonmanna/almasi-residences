import { RESIDENCE_PRICE_TYPES } from '@avida/types';
import { copy, type PagesDto } from './api';
import type { ResidenceType } from './residences';

/**
 * Website → Prices. Each homepage "from" price is calculated from the live
 * inventory unless its manual override is on. `null` means "calculate it";
 * an override left empty hides the price.
 */
export interface PriceDisplay {
  hero: string | null;
  building: string | null;
  /** Per type; a type absent stays calculated. */
  residences: Partial<Record<ResidenceType, string>>;
  payment: {
    show: boolean;
    /** Major units per type; a type absent stays calculated. */
    prices: Partial<Record<ResidenceType, number>>;
  };
}

const on = (pages: PagesDto, key: string) => pages.priceDisplay?.[key] === true;

/** "$99,000", "99 000", "99000.50" → 99000.5; anything without a number → null. */
function parseMajor(text: string): number | null {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return text && Number.isFinite(n) && n > 0 ? n : null;
}

export function priceDisplay(pages: PagesDto): PriceDisplay {
  const residences: PriceDisplay['residences'] = {};
  const prices: PriceDisplay['payment']['prices'] = {};
  for (const t of RESIDENCE_PRICE_TYPES) {
    const text = copy(pages, 'priceDisplay', `residencesPrice${t.suffix}`);
    if (on(pages, 'residencesPriceOverride') && text) residences[t.type] = text;
    const major = parseMajor(copy(pages, 'priceDisplay', `paymentPrice${t.suffix}`));
    if (on(pages, 'paymentPriceOverride') && major !== null) prices[t.type] = major;
  }
  return {
    hero: on(pages, 'heroPriceOverride') ? copy(pages, 'priceDisplay', 'heroPriceText') : null,
    building: on(pages, 'buildingPriceOverride') ? copy(pages, 'priceDisplay', 'buildingPriceText') : null,
    residences,
    payment: { show: pages.priceDisplay?.paymentShowPrices !== false, prices },
  };
}
