'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { formatCount, formatDate, formatMoney, formatPercent } from '@avida/types';
import type { MilestoneDto, PublicResidenceDto, UnitDetailDto } from '../../lib/api';
import {
  ORIENTATION_TEXT,
  STATUS_TEXT,
  TYPE_TEXT,
  viewText,
  visiblePriceMinor,
  type Residence,
} from '../../lib/residences';
import { useInventory, useResidence } from '../providers/InventoryProvider';
import { ContactActions } from '../enquiry/ContactActions';
import { EnquiryForm, type EnquiryResidence } from '../enquiry/EnquiryForm';
import { ElevationStack } from '../explore/ElevationStack';
import { MotionMedia } from '../ui/MotionMedia';
import { Reveal } from '../ui/Reveal';
import { ApiImage } from '../ui/ApiImage';
import { Lightbox } from '../ui/Lightbox';
import { SceneImage } from '../ui/SceneImage';
import { PlanDrawing } from './PlanDrawing';
import { track } from '../../lib/analytics';
import { useTrackInView } from '../../lib/use-track-in-view';
import { useResidenceShortlist } from '../../lib/shortlist';
import styles from './ResidenceDetail.module.css';

export function ResidenceDetail({
  fallback,
  schedule,
  balconySqm,
  typologyText,
  handover,
  milestones,
  publicData = null,
}: {
  fallback: Residence;
  schedule: UnitDetailDto['schedule'] | null;
  balconySqm: number | null;
  typologyText: string | null;
  handover: string | null;
  milestones: MilestoneDto[];
  /** The residence's own record from the admin: photographs, plans, features. */
  publicData?: PublicResidenceDto | null;
}) {
  // Live status and price from the shared inventory; the server's copy until it arrives.
  const r = useResidence(fallback.slug) ?? fallback;
  const { residences, floors } = useInventory();
  const router = useRouter();
  const [tab, setTab] = useState<'plan' | 'furnished'>('plan');
  const [planOpen, setPlanOpen] = useState(false);
  const shortlist = useResidenceShortlist();

  // Photographs and plans come from the admin: the residence's own, else its type's (API).
  // With none, an empty frame says so — never another type's artwork (roadmap item 17).
  const photos = (publicData?.images ?? []).filter((m) => m.kind === 'IMAGE');
  const videos = (publicData?.videos ?? []).filter((m) => m.kind === 'VIDEO');
  const heroPhoto = photos[0] ?? null;
  const planImage = (publicData?.floorPlans ?? []).find((m) => m.kind === 'IMAGE') ?? null;
  const planFile = (publicData?.floorPlans ?? []).find((m) => m.kind !== 'IMAGE') ?? null;
  // §5.4 — the specification is data from the admin; parking and storage are this residence's own facts.
  const spec = [
    ...(publicData && publicData.features.length ? [{ label: 'This residence', text: `${publicData.features.map((f) => f.name).join(', ')}.` }] : []),
    ...(publicData?.specifications ?? []).map((x) => ({ label: x.label, text: x.value })),
    ...(publicData && publicData.parkingIncluded > 0
      ? [{ label: 'Parking', text: `${publicData.parkingIncluded === 1 ? 'One parking bay' : `${publicData.parkingIncluded} parking bays`} with this residence${publicData.hasStorage ? ', and a private storage room' : ''}.` }]
      : []),
  ];
  const price = visiblePriceMinor(r);
  const enquiry: EnquiryResidence = {
    id: r.id,
    label: r.label,
    summary: `${TYPE_TEXT[r.type]}, ${r.areaSqm} m², ${r.floorLabel.toLowerCase()}`,
  };
  const whatsappSubject = { label: r.label, typeText: TYPE_TEXT[r.type], areaSqm: r.areaSqm };
  const paragraphs = (typologyText ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const similar = residences
    .filter((x) => x.type === r.type && x.id !== r.id && x.publicStatus === 'available')
    .sort((a, b) => Math.abs(a.areaSqm - r.areaSqm) - Math.abs(b.areaSqm - r.areaSqm) || a.floorLevel - b.floorLevel)
    .slice(0, 3);
  const tourHref = r.type === 'penthouse' ? '/tour/penthouse' : '/tour';
  const planRef = useTrackInView<HTMLElement>('floor_plan_viewed', { residence: r.code, view: 'plan' });
  const paymentRef = useTrackInView<HTMLElement>('payment_plan_viewed', { residence: r.code });

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setTab((t) => (t === 'plan' ? 'furnished' : 'plan'));
    }
  };

  return (
    <>
      {/* ─── Opening ─────────────────────────────────────────────────── */}
      <section className={styles.hero} data-ground="night" data-nav-over aria-labelledby="residence-title">
        <div className={styles.heroMedia}>
          <MotionMedia image={heroPhoto} video={videos[0] ?? null} priority sizes="100vw" label={`Residence ${r.label}`} />
          <div className={styles.heroShade} aria-hidden="true" />
        </div>
        <div className={`container ${styles.heroContent}`}>
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            <ol>
              <li>
                <Link href="/residences">Residences</Link>
              </li>
              <li>
                <Link href={`/residences?floor=${r.floorLevel}`}>{r.floorLabel}</Link>
              </li>
              <li aria-current="page">{r.label}</li>
            </ol>
          </nav>
          <h1 id="residence-title" className={styles.code}>
            <span className="visually-hidden">Residence </span>
            {r.label}
          </h1>
          <p className={styles.kind}>{TYPE_TEXT[r.type]} residence</p>
          <dl className={styles.heroFacts}>
            <div>
              <dt>Interior</dt>
              <dd className="tabular">{r.areaSqm} m²</dd>
            </div>
            {balconySqm !== null && (
              <div>
                <dt>Balcony</dt>
                <dd className="tabular">{balconySqm} m²</dd>
              </div>
            )}
            <div>
              <dt>Floor</dt>
              <dd>{r.floorLabel}</dd>
            </div>
            <div>
              <dt>Bedrooms</dt>
              <dd className="tabular">{r.bedrooms}</dd>
            </div>
            {r.bathrooms !== null && (
              <div>
                <dt>Bathrooms</dt>
                <dd className="tabular">{r.bathrooms}</dd>
              </div>
            )}
            <div>
              <dt>Faces</dt>
              <dd>{ORIENTATION_TEXT[r.orientation]}</dd>
            </div>
          </dl>
          <div className={styles.heroFoot}>
            <div className={styles.priceBlock}>
              <span className="status" data-status={r.publicStatus}>
                {STATUS_TEXT[r.publicStatus]}
              </span>
              {price !== null ? (
                <p className={`${styles.price} tabular`}>{formatMoney({ amountMinor: price, currency: r.currency })}</p>
              ) : (
                <p className={styles.priceNote}>Ask the sales team about similar residences.</p>
              )}
            </div>
            <ContactActions residence={enquiry} whatsappSubject={whatsappSubject} source="residence-hero" />
            <button
              type="button"
              className="btn btn--ghost"
              aria-pressed={shortlist.favorites.includes(r.id)}
              onClick={() => {
                const added = shortlist.toggleFavorite(r.id);
                if (added) track('favorite_added', { residence: r.code });
              }}
            >
              {shortlist.favorites.includes(r.id) ? 'Saved to favourites' : 'Save residence'}
            </button>
          </div>
        </div>
        <p className={`cgi-note ${styles.heroNote}`}>{heroPhoto?.note || (heroPhoto?.caption ?? '')}</p>
      </section>

      {/* ─── The spaces ──────────────────────────────────────────────── */}
      <section className={`section ${styles.spaces}`} data-ground="quiet" aria-labelledby="spaces-title">
        <div className="container">
          <header className={styles.head}>
            <div>
              <p className={`mark ${styles.kicker}`}>The spaces</p>
              <h2 id="spaces-title" className="h2">
                Inside {r.label}
              </h2>
            </div>
            <div className={styles.headText}>
              {paragraphs.map((p, i) => (
                <p key={i} className={i === 0 ? 'lead' : 'body muted'}>
                  {p}
                </p>
              ))}
              <Link href={tourHref} className="link-line">
                Walk through a {TYPE_TEXT[r.type].toLowerCase()} in the 3D tour
              </Link>
            </div>
          </header>
          <div className={styles.grid}>
            {photos.length > 0 ? (
              photos.slice(0, 5).map((m, i) => (
                <figure key={m.id} className={styles.space} data-first={i === 0 ? 'true' : 'false'}>
                  <Reveal className={styles.spaceMedia}>
                    <ApiImage m={m} sizes={i === 0 ? '(max-width: 900px) 100vw, 66vw' : '(max-width: 900px) 100vw, 33vw'} focus={m.focus ?? undefined} />
                  </Reveal>
                  <figcaption className={styles.spaceCaption}>
                    <span>{m.title ?? ''}</span>
                    {(m.note || m.caption) && <span className="cgi-note">{m.note || m.caption}</span>}
                  </figcaption>
                </figure>
              ))
            ) : (
              <figure className={styles.space} data-first="true">
                <div className={styles.spaceMedia} style={{ position: 'relative' }}>
                  <SceneImage media={null} label={`Residence ${r.label}`} />
                </div>
              </figure>
            )}
          </div>
        </div>
      </section>

      {/* ─── Plan and position ───────────────────────────────────────── */}
      <section ref={planRef} className={`section ${styles.plans}`} data-ground="night" aria-labelledby="plan-title">
        <div className="container">
          <header className={styles.head}>
            <div>
              <p className={`mark ${styles.kicker}`}>The plan</p>
              <h2 id="plan-title" className="h2">
                Plan and position
              </h2>
            </div>
            <div className={styles.tabs} role="tablist" aria-label="Plan views" onKeyDown={onTabKey}>
              <button
                id="tab-plan"
                role="tab"
                type="button"
                aria-selected={tab === 'plan'}
                aria-controls="panel-plan"
                tabIndex={tab === 'plan' ? 0 : -1}
                onClick={() => setTab('plan')}
              >
                Plan
              </button>
              <button
                id="tab-furnished"
                role="tab"
                type="button"
                aria-selected={tab === 'furnished'}
                aria-controls="panel-furnished"
                tabIndex={tab === 'furnished' ? 0 : -1}
                onClick={() => {
                  setTab('furnished');
                  track('floor_plan_viewed', { residence: r.code, view: 'furnished' });
                }}
              >
                Furnished, in 3D
              </button>
            </div>
          </header>
          <div className={styles.planLayout}>
            <div>
              <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" hidden={tab !== 'plan'}>
                <PlanDrawing rooms={publicData?.rooms ?? []} orientation={r.orientation} areaSqm={r.areaSqm} label={r.label} />
              </div>
              <div id="panel-furnished" role="tabpanel" aria-labelledby="tab-furnished" hidden={tab !== 'furnished'}>
                {planImage ? (
                  <button
                    type="button"
                    className={styles.furnishedOpen}
                    onClick={() => {
                      setPlanOpen(true);
                      track('floor_plan_viewed', { residence: r.code, view: 'fullscreen' });
                    }}
                  >
                    <span className={styles.furnished}>
                      <SceneImage media={planImage} sizes="(max-width: 1100px) 100vw, 60vw" focus="50% 50%" label="Furnished plan" />
                    </span>
                    <span className={styles.furnishedHint}>Open full screen to zoom</span>
                  </button>
                ) : (
                  <div className={styles.furnished} style={{ position: 'relative' }}>
                    <SceneImage media={null} label="Furnished plan" />
                  </div>
                )}
                <p className="caption">
                  {planImage ? (planImage.caption ?? planImage.title ?? planImage.note ?? '') : ''}
                  {planFile && (
                    <>
                      {' '}
                      <a className="link-line" href={planFile.url} target="_blank" rel="noopener noreferrer">
                        Download the plan
                      </a>
                    </>
                  )}{' '}
                  <a className="link-line" href={`/api/v1/residences/${encodeURIComponent(r.slug)}/brochure.pdf`} download>
                    Download the brochure (PDF)
                  </a>
                </p>
              </div>
            </div>
            <aside className={styles.position} aria-label="Where it is in the building">
              <p className="mark muted">In the building</p>
              <ElevationStack
                residences={residences}
                floors={floors}
                focusLevel={r.floorLevel}
                selectedId={r.id}
                onSelect={(x) => router.push(`/residences/${x.slug}`)}
              />
              <p className="small muted">
                {r.floorLabel}, facing {ORIENTATION_TEXT[r.orientation].toLowerCase()}
                {r.viewTags.length > 0 ? `, toward ${viewText(r.viewTags).toLowerCase()}` : ''}.
              </p>
            </aside>
          </div>
        </div>
      </section>

      {/* ─── Specification ───────────────────────────────────────────── */}
      {spec.length > 0 && (
      <section className={`section ${styles.spec}`} data-ground="night" aria-labelledby="spec-title">
        <div className={`container ${styles.specLayout}`}>
          <div>
            <p className={`mark ${styles.kicker}`}>Specification</p>
            <h2 id="spec-title" className="h2">
              How it is built
              <br />
              and finished
            </h2>
          </div>
          <div>
            <dl className={styles.specList}>
              {spec.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.text}</dd>
                </div>
              ))}
            </dl>
            <p className="caption">The specification is indicative and confirmed in the sale contract.</p>
          </div>
        </div>
      </section>
      )}

      {/* ─── Payment ─────────────────────────────────────────────────── */}
      <section ref={paymentRef} className={`section ${styles.payment}`} data-ground="quiet" aria-labelledby="payment-title">
        <div className="container">
          <header className={styles.head}>
            <div>
              <p className={`mark ${styles.kicker}`}>Payment plan</p>
              <h2 id="payment-title" className="h2">
                {`${formatCount(Math.max(1, milestones.length))} stage${milestones.length === 1 ? '' : 's'}${schedule && price !== null ? ', one price' : ''}`}
              </h2>
            </div>
            <p className="lead">
              Each payment is tied to a stage of construction rather than a date.{handover ? ` Handover is planned for ${handover}.` : ''}
            </p>
          </header>
          {schedule && price !== null ? (
            <div className={styles.tableWrap}>
              <table className={styles.schedule}>
                <caption className="visually-hidden">Payment schedule for residence {r.label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">Share</th>
                    <th scope="col">Amount</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.rows.map((row) => (
                    <tr key={row.milestoneId}>
                      <th scope="row">{row.label}</th>
                      <td className="tabular">{formatPercent(row.percent)}</td>
                      <td className="tabular">{formatMoney({ amountMinor: row.amountMinor, currency: schedule.currency })}</td>
                      <td>{row.dueDate ? formatDate(row.dueDate) : (row.triggerNote ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="tabular">100%</td>
                    <td className="tabular">{formatMoney({ amountMinor: schedule.totalMinor, currency: schedule.currency })}</td>
                    <td>{handover ? `Handover ${handover}` : ''}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="body">
              {r.label} is {STATUS_TEXT[r.publicStatus].toLowerCase()}. Every residence follows the same plan:{' '}
              {milestones
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((m) => `${formatPercent(m.percent)} ${m.label.toLowerCase()}`)
                .join(', ')}
              .
            </p>
          )}
        </div>
      </section>

      {/* ─── Alternatives ────────────────────────────────────────────── */}
      {similar.length > 0 && (
        <section className={`section ${styles.similarSection}`} data-ground="night" aria-labelledby="similar-title">
          <div className="container">
            <h2 id="similar-title" className="h3">
              {r.publicStatus === 'available' ? 'Similar residences, available now' : 'Available instead'}
            </h2>
            <ul className={styles.similar}>
              {similar.map((s) => {
                const p = visiblePriceMinor(s);
                return (
                  <li key={s.id}>
                    <Link href={`/residences/${s.slug}`} className={styles.simRow}>
                      <span className={styles.simCode}>{s.label}</span>
                      <span className="small">
                        {TYPE_TEXT[s.type]}
                        <br />
                        <span className="muted tabular">
                          {s.areaSqm} m², {s.floorLabel.toLowerCase()}
                        </span>
                      </span>
                      <span className="status" data-status={s.publicStatus}>
                        {STATUS_TEXT[s.publicStatus]}
                      </span>
                      <span className="tabular small">
                        {p !== null ? formatMoney({ amountMinor: p, currency: s.currency }) : ''}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <Lightbox
        media={planImage}
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        caption={planImage?.caption ?? planImage?.title ?? `Residence ${r.label} — furnished plan`}
      />

      {/* ─── Enquire ─────────────────────────────────────────────────── */}
      <section className={`section ${styles.enquire}`} data-ground="quiet" data-hide-sticky-cta aria-labelledby="residence-enquire-title">
        <div className={`container ${styles.enquireLayout}`}>
          <div className={styles.enquireText}>
            <p className={`mark ${styles.kicker}`}>Enquire</p>
            <h2 id="residence-enquire-title" className="h2">
              Enquire about {r.label}
            </h2>
            <p className="lead">
              The sales team will reply within one working day with the current price, the dimensioned
              plan and a time to visit.
            </p>
            <ContactActions residence={enquiry} whatsappSubject={whatsappSubject} source="residence-enquire" layout="stack" />
          </div>
          <div className={styles.formBox}>
            <EnquiryForm residence={enquiry} intent="VIEWING" source="residence-page" />
          </div>
        </div>
      </section>
    </>
  );
}
