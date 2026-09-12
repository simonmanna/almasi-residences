import { useMemo } from 'react';
import { ORIENTATIONS } from '@avida/types';
import { area, money, ORIENTATION_TEXT } from '../lib/format';
import { floorName, useFeatures, useFloors, usePlans, useTypes } from '../lib/ref';
import { Checkbox, Field, Input, MoneyInput, NumberInput, Select, Textarea, Toggle } from './ui';

/** The editable shape of a residence, shared by the wizard and the detail screen. */
export interface ResidenceDraft {
  code: string;
  floorId: string;
  typologyId: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  interiorSqm: number | null;
  balconySqm: number | null;
  terraceSqm: number | null;
  exteriorSqm: number | null;
  parkingIncluded: number | null;
  hasStorage: boolean;
  storageNote: string;
  orientation: string;
  viewTags: string[];
  availabilityDate: string;
  shortDescription: string;
  description: string;
  priceMinor: number | null;
  currency: string;
  discountMinor: number | null;
  promoPriceMinor: number | null;
  promoEndsAt: string;
  reservationFeeMinor: number | null;
  depositPercent: number | null;
  paymentPlanId: string;
  featureIds: string[];
  published: boolean;
  featured: boolean;
  tags: string[];
  notes: string;
}

export const EMPTY_DRAFT: ResidenceDraft = {
  code: '',
  floorId: '',
  typologyId: '',
  bedrooms: null,
  bathrooms: null,
  areaSqm: null,
  interiorSqm: null,
  balconySqm: null,
  terraceSqm: null,
  exteriorSqm: null,
  parkingIncluded: 1,
  hasStorage: true,
  storageNote: '',
  orientation: 'S',
  viewTags: [],
  availabilityDate: '',
  shortDescription: '',
  description: '',
  priceMinor: null,
  currency: 'USD',
  discountMinor: null,
  promoPriceMinor: null,
  promoEndsAt: '',
  reservationFeeMinor: null,
  depositPercent: null,
  paymentPlanId: '',
  featureIds: [],
  published: false,
  featured: false,
  tags: [],
  notes: '',
};

export type Errors = Partial<Record<keyof ResidenceDraft, string>>;
type Set = <K extends keyof ResidenceDraft>(k: K, v: ResidenceDraft[K]) => void;

/** §31 / §35 — checked before a request is sent, so errors appear next to the field. */
export function validate(d: ResidenceDraft, step?: 'basic' | 'size' | 'pricing'): Errors {
  const e: Errors = {};
  if (!step || step === 'basic') {
    if (!d.code.trim()) e.code = 'Enter a unit code, such as A1 or PH-C.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,15}$/.test(d.code.trim())) e.code = 'Letters, numbers, spaces or dashes, up to 16 characters.';
    if (!d.floorId) e.floorId = 'Choose the floor.';
    if (!d.typologyId) e.typologyId = 'Choose a residence type.';
    if (d.bedrooms === null || d.bedrooms < 0 || !Number.isInteger(d.bedrooms)) e.bedrooms = 'Enter a whole number of bedrooms.';
    if (d.bathrooms === null || d.bathrooms < 0) e.bathrooms = 'Enter the number of bathrooms.';
  }
  if (!step || step === 'size') {
    if (!d.areaSqm || d.areaSqm <= 0) e.areaSqm = 'Enter the total size, above zero.';
    for (const k of ['interiorSqm', 'balconySqm', 'terraceSqm', 'exteriorSqm'] as const) if (d[k] !== null && d[k]! < 0) e[k] = 'Sizes cannot be negative.';
    const parts = (d.interiorSqm ?? 0) + (d.balconySqm ?? 0) + (d.terraceSqm ?? 0) + (d.exteriorSqm ?? 0);
    if (d.areaSqm && parts > d.areaSqm + 0.5) e.areaSqm = `The parts add up to ${area(parts)}, more than the total.`;
    if (d.parkingIncluded !== null && (d.parkingIncluded < 0 || !Number.isInteger(d.parkingIncluded))) e.parkingIncluded = 'A whole number of bays.';
  }
  if (!step || step === 'pricing') {
    if (!d.priceMinor || d.priceMinor <= 0) e.priceMinor = 'Enter the selling price.';
    if (d.priceMinor && d.discountMinor !== null && d.discountMinor >= d.priceMinor) e.discountMinor = 'The discount must be less than the price.';
    if (d.priceMinor && d.promoPriceMinor !== null && d.promoPriceMinor >= d.priceMinor) e.promoPriceMinor = 'The promotional price must be below the list price.';
    if (d.depositPercent !== null && (d.depositPercent < 0 || d.depositPercent > 100)) e.depositPercent = 'Between 0 and 100%.';
  }
  return e;
}

export function BasicFields({ d, set, errors = {} }: { d: ResidenceDraft; set: Set; errors?: Errors }) {
  const { data: floors } = useFloors();
  const { data: types } = useTypes();
  return (
    <div className="form-grid">
      <Field label="Unit code" error={errors.code} hint="As the sales team says it: A1, PH-C.">
        <Input value={d.code} aria-invalid={Boolean(errors.code)} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="A1" />
      </Field>
      <Field label="Floor" error={errors.floorId}>
        <Select value={d.floorId} aria-invalid={Boolean(errors.floorId)} onChange={(e) => set('floorId', e.target.value)} placeholder="Choose a floor" options={(floors ?? []).map((f) => ({ value: f.id, label: floorName(f) }))} />
      </Field>
      <Field label="Residence type" error={errors.typologyId} hint="Types are managed under Property → Residence types.">
        <Select
          value={d.typologyId}
          aria-invalid={Boolean(errors.typologyId)}
          onChange={(e) => {
            const t = types?.find((x) => x.id === e.target.value);
            set('typologyId', e.target.value);
            if (t && d.bedrooms === null) set('bedrooms', t.bedrooms);
            if (t && d.bathrooms === null) set('bathrooms', t.bathrooms);
          }}
          placeholder="Choose a type"
          options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
      </Field>
      <div className="form-grid" style={{ gap: 12 }}>
        <Field label="Bedrooms" error={errors.bedrooms}>
          <NumberInput value={d.bedrooms} step="1" min={0} onChange={(v) => set('bedrooms', v)} aria-invalid={Boolean(errors.bedrooms)} />
        </Field>
        <Field label="Bathrooms" error={errors.bathrooms}>
          <NumberInput value={d.bathrooms} step="0.5" min={0} onChange={(v) => set('bathrooms', v)} aria-invalid={Boolean(errors.bathrooms)} />
        </Field>
      </div>
    </div>
  );
}

export function SizeFields({ d, set, errors = {} }: { d: ResidenceDraft; set: Set; errors?: Errors }) {
  const parts = (d.interiorSqm ?? 0) + (d.balconySqm ?? 0) + (d.terraceSqm ?? 0) + (d.exteriorSqm ?? 0);
  const views = ['city', 'hills', 'green', 'sunrise', 'sunset', 'pool', 'garden'];
  return (
    <div className="stack">
      <div className="form-grid three">
        <Field label="Interior" error={errors.interiorSqm}>
          <NumberInput value={d.interiorSqm} suffix="m²" min={0} onChange={(v) => set('interiorSqm', v)} />
        </Field>
        <Field label="Balcony" error={errors.balconySqm}>
          <NumberInput value={d.balconySqm} suffix="m²" min={0} onChange={(v) => set('balconySqm', v)} />
        </Field>
        <Field label="Terrace" error={errors.terraceSqm}>
          <NumberInput value={d.terraceSqm} suffix="m²" min={0} onChange={(v) => set('terraceSqm', v)} />
        </Field>
        <Field label="Other exterior" error={errors.exteriorSqm}>
          <NumberInput value={d.exteriorSqm} suffix="m²" min={0} onChange={(v) => set('exteriorSqm', v)} />
        </Field>
        <Field
          label="Total size"
          error={errors.areaSqm}
          hint={parts > 0 && parts !== d.areaSqm ? <button type="button" className="btn xs" onClick={() => set('areaSqm', Math.round(parts * 10) / 10)}>Use the sum: {area(parts)}</button> : 'The saleable area buyers see.'}
        >
          <NumberInput value={d.areaSqm} suffix="m²" min={0} onChange={(v) => set('areaSqm', v)} aria-invalid={Boolean(errors.areaSqm)} />
        </Field>
        <Field label="Parking bays included" error={errors.parkingIncluded}>
          <NumberInput value={d.parkingIncluded} step="1" min={0} onChange={(v) => set('parkingIncluded', v)} />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Orientation">
          <Select value={d.orientation} onChange={(e) => set('orientation', e.target.value)} options={ORIENTATIONS.map((o) => ({ value: o, label: ORIENTATION_TEXT[o]! }))} />
        </Field>
        <Field label="Available from" hint="Leave empty if it is available now.">
          <Input type="date" value={d.availabilityDate} onChange={(e) => set('availabilityDate', e.target.value)} />
        </Field>
        <div className="field full">
          <span>Views</span>
          <div className="row-wrap">
            {views.map((v) => (
              <Checkbox key={v} label={v[0]!.toUpperCase() + v.slice(1)} checked={d.viewTags.includes(v)} onChange={(on) => set('viewTags', on ? [...d.viewTags, v] : d.viewTags.filter((x) => x !== v))} />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Storage</span>
          <Toggle checked={d.hasStorage} onChange={(v) => set('hasStorage', v)} label="Private storage room" />
        </div>
        <Field label="Storage note">
          <Input value={d.storageNote} disabled={!d.hasStorage} onChange={(e) => set('storageNote', e.target.value)} placeholder="Basement store S-12" />
        </Field>
      </div>
    </div>
  );
}

export function PricingFields({ d, set, errors = {} }: { d: ResidenceDraft; set: Set; errors?: Errors }) {
  const { data: plans } = usePlans();
  const perSqm = d.priceMinor && d.areaSqm ? Math.round(d.priceMinor / d.areaSqm) : null;
  const now = d.promoPriceMinor ?? (d.priceMinor !== null ? d.priceMinor - (d.discountMinor ?? 0) : null);
  return (
    <div className="stack">
      <div className="form-grid three">
        <Field label="Selling price" error={errors.priceMinor}>
          <MoneyInput value={d.priceMinor} currency={d.currency} onChange={(v) => set('priceMinor', v)} aria-invalid={Boolean(errors.priceMinor)} />
        </Field>
        <Field label="Currency">
          <Select value={d.currency} onChange={(e) => set('currency', e.target.value)} options={['USD', 'RWF', 'EUR', 'GBP', 'KES'].map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Price per m²" hint="Calculated from price and size.">
          <Input value={perSqm ? money(perSqm, d.currency) : '—'} disabled />
        </Field>
        <Field label="Discount" error={errors.discountMinor} hint="Taken off the list price.">
          <MoneyInput value={d.discountMinor} currency={d.currency} onChange={(v) => set('discountMinor', v)} />
        </Field>
        <Field label="Promotional price" error={errors.promoPriceMinor} hint="Replaces the price until it ends.">
          <MoneyInput value={d.promoPriceMinor} currency={d.currency} onChange={(v) => set('promoPriceMinor', v)} />
        </Field>
        <Field label="Promotion ends">
          <Input type="date" value={d.promoEndsAt} disabled={d.promoPriceMinor === null} onChange={(e) => set('promoEndsAt', e.target.value)} />
        </Field>
        <Field label="Reservation fee">
          <MoneyInput value={d.reservationFeeMinor} currency={d.currency} onChange={(v) => set('reservationFeeMinor', v)} />
        </Field>
        <Field label="Deposit" error={errors.depositPercent} hint="Leave empty to use the plan’s.">
          <NumberInput value={d.depositPercent} suffix="%" min={0} max={100} onChange={(v) => set('depositPercent', v)} />
        </Field>
        <Field label="Payment plan">
          <Select value={d.paymentPlanId} onChange={(e) => set('paymentPlanId', e.target.value)} placeholder="The default plan" options={(plans ?? []).map((p) => ({ value: p.id, label: `${p.name}${p.isDefault ? ' (default)' : ''}` }))} />
        </Field>
      </div>
      {now !== null && d.priceMinor !== null && now !== d.priceMinor && (
        <div className="alert info">
          Buyers pay <strong>&nbsp;{money(now, d.currency)}&nbsp;</strong> today instead of {money(d.priceMinor, d.currency)}.
        </div>
      )}
    </div>
  );
}

export function FeaturePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: features } = useFeatures();
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const f of features ?? []) m.set(f.category, [...(m.get(f.category) ?? []), f]);
    return [...m.entries()];
  }, [features]);
  return (
    <div className="grid-3">
      {groups.map(([cat, list]) => (
        <div key={cat} className="stack-sm">
          <div className="label">{cat}</div>
          {list.map((f) => (
            <Checkbox key={f.id} label={f.name} checked={value.includes(f.id)} onChange={(on) => onChange(on ? [...value, f.id] : value.filter((x) => x !== f.id))} />
          ))}
        </div>
      ))}
      {groups.length === 0 && <p className="muted">No features yet. Add them under Residence types → Features.</p>}
    </div>
  );
}

export function DescriptionFields({ d, set }: { d: ResidenceDraft; set: Set }) {
  return (
    <div className="form-grid">
      <Field label="Short description" className="full" hint="One line for cards and search results.">
        <Input value={d.shortDescription} maxLength={300} onChange={(e) => set('shortDescription', e.target.value)} />
      </Field>
      <Field label="Description" className="full" hint="Shown on the residence page. Blank lines start new paragraphs.">
        <Textarea rows={6} value={d.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
    </div>
  );
}

/** Converts the draft to the API's body. Empty strings become null. */
export function toBody(d: ResidenceDraft) {
  const s = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    code: d.code.trim(),
    floorId: d.floorId,
    typologyId: d.typologyId,
    bedrooms: d.bedrooms ?? 0,
    bathrooms: d.bathrooms ?? 0,
    areaSqm: d.areaSqm ?? 0,
    interiorSqm: d.interiorSqm,
    balconySqm: d.balconySqm,
    terraceSqm: d.terraceSqm,
    exteriorSqm: d.exteriorSqm,
    parkingIncluded: d.parkingIncluded ?? 0,
    hasStorage: d.hasStorage,
    storageNote: s(d.storageNote),
    orientation: d.orientation,
    viewTags: d.viewTags,
    availabilityDate: d.availabilityDate || null,
    shortDescription: s(d.shortDescription),
    description: s(d.description),
    priceMinor: d.priceMinor ?? 0,
    currency: d.currency,
    discountMinor: d.discountMinor,
    promoPriceMinor: d.promoPriceMinor,
    promoEndsAt: d.promoPriceMinor ? d.promoEndsAt || null : null,
    reservationFeeMinor: d.reservationFeeMinor,
    depositPercent: d.depositPercent,
    paymentPlanId: d.paymentPlanId || null,
    featureIds: d.featureIds,
    published: d.published,
    featured: d.featured,
    tags: d.tags,
    notes: s(d.notes),
  };
}
