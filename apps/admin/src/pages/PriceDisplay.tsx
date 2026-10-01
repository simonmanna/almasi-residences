import { Building2, CreditCard, DoorOpen, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { RESIDENCE_PRICE_TYPES } from '@avida/types';
import { SITE_URL } from '../lib/site';
import { SectionSettings, type SectionField } from '../components/SectionSettings';
import { PageHead } from '../components/ui';

const PAGE = 'priceDisplay';

/** A switch that is off until the admin turns it on: never saved means "calculate it". */
const override = (key: string, what: string, on = 'On: the text below is shown'): SectionField => ({
  key,
  label: 'Manual override',
  type: 'boolean',
  initial: false,
  on,
  off: `Off: ${what} is calculated automatically`,
});

const perType = (prefix: string, hint: string): SectionField[] =>
  RESIDENCE_PRICE_TYPES.map((t) => ({
    key: `${prefix}${t.suffix}`,
    label: `${t.label[0]!.toUpperCase()}${t.label.slice(1)}`,
    type: 'text',
    hint,
    showIf: `${prefix}Override`,
  }));

/**
 * Website → Prices — each homepage "from" price is worked out from the live
 * inventory, unless its manual override is on, when the admin's words are shown.
 */
export default function PriceDisplay() {
  return (
    <>
      <PageHead
        title="Prices on the website"
        sub="Each “from” price is calculated from the residences on sale. Turn on a manual override to write the price yourself."
        crumbs={[{ label: 'Website' }, { label: 'Prices' }]}
      >
        <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View the homepage</a>
      </PageHead>
      <SectionSettings
        pageKey={PAGE}
        title="Hero section"
        icon={<ImageIcon size={18} />}
        fields={[
          override('heroPriceOverride', '“Price from” in the hero'),
          { key: 'heroPriceText', label: 'Price from', type: 'text', hint: 'Shown exactly as written, e.g. “$99,000”. Empty hides the price.', showIf: 'heroPriceOverride' },
        ]}
      />
      <SectionSettings
        pageKey={PAGE}
        title="The Building — Explore Almasi"
        icon={<Building2 size={18} />}
        fields={[
          override('buildingPriceOverride', 'the “from” price above the board'),
          { key: 'buildingPriceText', label: 'From', type: 'text', hint: 'Shown exactly as written after “from”, e.g. “$99K”. Empty hides the price.', showIf: 'buildingPriceOverride' },
        ]}
      />
      <SectionSettings
        pageKey={PAGE}
        title="Residences"
        icon={<DoorOpen size={18} />}
        fields={[
          override('residencesPriceOverride', 'each card’s “From” price'),
          ...perType('residencesPrice', 'Shown exactly as written, e.g. “$99,000”. Empty stays calculated.'),
        ]}
      />
      <SectionSettings
        pageKey={PAGE}
        title="Payment plan"
        icon={<CreditCard size={18} />}
        fields={[
          { key: 'paymentShowPrices', label: 'Show prices', type: 'boolean', on: 'Example amounts shown', off: 'Prices hidden: only the percentages show' },
          override('paymentPriceOverride', 'each type’s example price', 'On: the prices below are used'),
          ...perType('paymentPrice', 'A number, e.g. 99000. Each payment is this price times its percentage. Empty stays calculated.'),
        ]}
      />
    </>
  );
}
