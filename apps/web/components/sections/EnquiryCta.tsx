import { EnquiryForm } from '../EnquiryForm';

/** §2.5 — centre alignment is reserved for the hero line and this, the final call to action. */
export function EnquiryCta() {
  return (
    <section id="enquire" className="section section-cta">
      <h2 className="head">Request a viewing</h2>
      <p className="prose">
        Tell us which apartments interest you and someone from the sales team will be in touch
        within one working day.
      </p>
      <EnquiryForm source="page-cta" />
    </section>
  );
}
