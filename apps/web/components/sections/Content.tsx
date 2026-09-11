import Link from 'next/link';
import {
  formatArea,
  formatCount,
  formatDistance,
  formatMoney,
  formatPercent,
  formatQuarter,
} from '@avida/types';
import type { DevelopmentDto, MediaSetDto } from '../../lib/api';
import { CgiDisclaimer } from '../CgiDisclaimer';
import { TimedImage } from '../TimedImage';
import { TimeScrubber } from '../TimeScrubber';

/**
 * §6.3 — the marketing sections. Server components: none of them need client
 * state, so none of them ship JavaScript. Only the time system, the elevation
 * stack and the enquiry form are interactive.
 */

export function Hero({ dev, hero }: { dev: DevelopmentDto; hero?: MediaSetDto }) {
  return (
    <header id="hero" className="hero">
      {hero && <TimedImage set={hero} priority className="hero-image" />}
      <div className="hero-copy">
        {/* §2.4 — the development's name is the one italic display moment. */}
        <h1 className="display display-italic">{dev.name}</h1>
        {dev.tagline && <p className="lead">{dev.tagline}</p>}
        {/* §2.1 — no middle-dot meta strings. Two facts, two sentences. */}
        <p className="meta">
          {dev.city}. {formatCount(dev.summary.available)} of {dev.summary.total} units available.
          {dev.handoverDate && ` Handover ${formatQuarter(dev.handoverDate)}.`}
        </p>
        <TimeScrubber />
      </div>
      <CgiDisclaimer className="disclaimer" />
    </header>
  );
}

export function Narrative({ dev, aerial }: { dev: DevelopmentDto; aerial?: MediaSetDto }) {
  // The seed description is markdown-ish placeholder; Phase 1 renders paragraphs
  // rather than pulling in a markdown pipeline for text that will be replaced.
  const paragraphs = dev.descriptionMd
    .split('\n\n')
    .map((p) => p.replace(/^_|_$/g, '').trim())
    .filter(Boolean);

  return (
    <section id="narrative" className="section">
      <h2 className="head">The building</h2>
      <div className="prose">
        {paragraphs.slice(0, 2).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {aerial && (
        <figure className="figure-wide">
          <TimedImage set={aerial} className="figure-image" />
          <figcaption className="note">
            {aerial.label}. <CgiDisclaimerInline />
          </figcaption>
        </figure>
      )}
      <div className="prose">
        {paragraphs.slice(2).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

function CgiDisclaimerInline() {
  return <span>Computer-generated image. Final finishes, layout and views subject to change.</span>;
}

export function Residences({ dev, mode }: { dev: DevelopmentDto; mode: 'single' | 'multi' }) {
  return (
    <section id="residences" className="section">
      <h2 className="head">Residences</h2>
      <p className="prose">
        Twenty-eight apartments across the Ground floor and three upper floors, with three
        penthouses on the top level. Every apartment has its own balcony.
      </p>

      <ul className="typology-list">
        {dev.typologies.map((t) => (
          <li key={t.id} className="typology-card">
            <h3 className="typology-name">
              {mode === 'multi' ? (
                <Link href={`/residences/${t.slug}`}>{t.name}</Link>
              ) : (
                t.name
              )}
            </h3>
            <dl className="typology-facts">
              <div>
                <dt>Bedrooms</dt>
                <dd data-numeric>{t.bedrooms === 0 ? 'Studio' : t.bedrooms}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd data-numeric>
                  {formatArea(t.areaSqmMin)} to {formatArea(t.areaSqmMax)}
                </dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd data-numeric>
                  {t.summary.available} of {t.summary.total}
                </dd>
              </div>
              {t.summary.priceMinorFrom !== null && (
                <div>
                  <dt>From</dt>
                  <dd data-numeric>
                    {formatMoney({
                      amountMinor: t.summary.priceMinorFrom,
                      currency: dev.currency,
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Amenities({ dev }: { dev: DevelopmentDto }) {
  return (
    <section id="amenities" className="section">
      <h2 className="head">Amenities</h2>
      {/* §6.3 — editorial layout, not a card grid: alternating text blocks with
          real descriptions rather than eight identical rounded boxes (§2.1). */}
      <div className="amenity-list">
        {dev.amenities.map((a, i) => (
          <article key={a.id} className="amenity" data-align={i % 2 === 0 ? 'start' : 'end'}>
            <h3 className="amenity-name">{a.name}</h3>
            {a.descriptionMd && <p className="prose">{a.descriptionMd}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export function Location({ dev }: { dev: DevelopmentDto }) {
  return (
    <section id="location" className="section">
      <h2 className="head">Location</h2>
      <p className="prose">
        {dev.city}, {dev.country}. Distances are straight-line from the site; travel times are
        modelled estimates, not promises.
      </p>
      <ul className="landmarks">
        {dev.landmarks.map((l) => (
          <li key={l.id}>
            <span>{l.name}</span>
            <span className="landmark-meta">
              <span data-numeric>{l.distanceM === null ? '—' : formatDistance(l.distanceM)}</span>
              {l.driveMinutes !== null && (
                <span data-numeric className="muted">
                  {l.driveMinutes} min drive
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PaymentPlan({ dev }: { dev: DevelopmentDto }) {
  const from = dev.summary.priceMinorMin;
  return (
    <section id="payment" className="section">
      <h2 className="head">Payment plan</h2>
      <p className="prose">
        Four stages from signing to handover: 30% on signing, 30% on completion of structure,
        30% on completion of tiling, and 10% on final handover. Select a unit on the availability
        drawing to see the schedule for its exact price.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col" className="align-right">
              Share
            </th>
            {from !== null && (
              <th scope="col" className="align-right">
                On the lowest available price
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {dev.milestones.map((m) => (
            <tr key={m.id}>
              <th scope="row">{m.label}</th>
              <td data-numeric className="align-right">
                {formatPercent(m.percent)}
              </td>
              {from !== null && (
                <td data-numeric className="align-right muted">
                  {formatMoney({
                    amountMinor: Math.round((from * m.percent) / 100),
                    currency: dev.currency,
                  })}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Developer() {
  return (
    <section id="developer" className="section">
      <h2 className="head">The developer</h2>
      <p className="prose">
        Almasi Residences is developed by an experienced team with a track record of delivering
        premium residential projects in Kigali. The developer works with Rwandan-registered
        contractors and follows all regulatory requirements of the Rwanda Housing Authority.
      </p>
      <p className="note">
        For detailed information about the developer's portfolio, completed projects, and
        construction timeline, speak with the sales team.
      </p>
    </section>
  );
}

export function Faq({ dev }: { dev: DevelopmentDto }) {
  return (
    <section id="faq" className="section">
      <h2 className="head">Questions</h2>
      <dl className="faq">
        {dev.faqs.map((f) => (
          <div key={f.id} className="faq-item">
            <dt>{f.question}</dt>
            <dd>{f.answerMd}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SiteFooter({ dev }: { dev: DevelopmentDto }) {
  return (
    <footer className="footer">
      <p className="note">
        {dev.name}, {dev.city}. Computer-generated imagery throughout; final finishes, layout and
        views subject to change. Prices and availability are indicative and subject to contract.
      </p>
    </footer>
  );
}
