import { formatDate } from '@avida/types';

/**
 * §9 Phase 6 — construction progress. This is the section that answers "can I
 * trust this developer to deliver" (§1.2) with evidence rather than adjectives,
 * so it is dated, specific, and it shows the percentage as recorded rather than
 * as a claim.
 */
export interface ProgressUpdate {
  id: string;
  capturedOn: string;
  title: string;
  bodyMd: string | null;
  percentComplete: number | null;
}

export function ProgressTimeline({ updates }: { updates: ProgressUpdate[] }) {
  if (updates.length === 0) {
    return (
      <section id="progress" className="section">
        <h2 className="head">Construction progress</h2>
        <p className="prose">
          Progress updates appear here from the start of construction, dated and photographed.
        </p>
        <p className="note">TODO(content) — no updates recorded yet.</p>
      </section>
    );
  }

  return (
    <section id="progress" className="section">
      <h2 className="head">Construction progress</h2>
      <ol className="timeline">
        {updates.map((u) => (
          <li key={u.id} className="timeline-item">
            <p className="timeline-date" data-numeric>
              {formatDate(u.capturedOn)}
            </p>
            <h3 className="timeline-title">{u.title}</h3>
            {u.percentComplete !== null && (
              <p className="timeline-percent">
                <span
                  className="timeline-bar"
                  style={{ inlineSize: `${u.percentComplete}%` }}
                  role="img"
                  aria-label={`${u.percentComplete} percent complete`}
                />
                <span data-numeric>{u.percentComplete}% complete</span>
              </p>
            )}
            {u.bodyMd && <p className="prose">{u.bodyMd}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
