import Link from 'next/link';
import { formatDate } from '@avida/types';
import type { ProgressUpdateDto } from '../../lib/api';
import styles from './ProgressPreview.module.css';

/**
 * Roadmap item 63 — the strongest off-plan trust signal, construction as it
 * happens, brought onto the homepage. Dated updates from the admin; the
 * percentage is shown as recorded, never estimated. Absent until the first update.
 */
export function ProgressPreview({ updates, kicker, title }: { updates: ProgressUpdateDto[]; kicker: string; title: string[] }) {
  const recent = [...updates].sort((a, b) => b.capturedOn.localeCompare(a.capturedOn)).slice(0, 3);
  if (recent.length === 0) return null;
  const latest = recent.find((u) => u.percentComplete !== null)?.percentComplete ?? null;

  return (
    <section className={`section ${styles.section}`} aria-labelledby="progress-preview-title">
      <div className={`container ${styles.layout}`}>
        <header className={styles.head}>
          {kicker && <p className="mark">{kicker}</p>}
          <h2 id="progress-preview-title" className="h2">
            {title.map((line, i) => (
              <span key={i} className={i > 0 ? 'italic' : undefined}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h2>
          {latest !== null && (
            <div className={styles.gauge} role="img" aria-label={`${latest}% complete at the latest update`}>
              <span className={`${styles.figure} tabular`}>{latest}%</span>
              <span className={styles.track} aria-hidden="true">
                <span style={{ transform: `scaleX(${latest / 100})` }} />
              </span>
              <span className="caption">complete, as last recorded on site</span>
            </div>
          )}
          <Link href="/progress" className="link-line">
            Every dated update
          </Link>
        </header>
        <ol className={styles.list}>
          {recent.map((u) => (
            <li key={u.id} className={styles.item}>
              <time className={`${styles.date} tabular`} dateTime={u.capturedOn}>
                {formatDate(u.capturedOn)}
              </time>
              <p className={styles.title}>{u.title}</p>
              {u.bodyMd && <p className="small muted">{u.bodyMd}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
