import type { ReactNode } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { SceneImage } from '../ui/SceneImage';
import styles from './PageHero.module.css';

/** The opening of an inner page: its placement from the admin, full bleed, and its title set over it. */
export function PageHero({
  media,
  mediaLabel,
  kicker,
  title,
  lede,
  children,
}: {
  media: PublicMediaDto | null;
  mediaLabel: string;
  kicker: string;
  title: ReactNode;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.hero} data-ground="night" data-nav-over aria-labelledby="page-title">
      <div className={styles.media}>
        <SceneImage media={media} priority sizes="100vw" label={mediaLabel} />
        <div className={styles.shade} aria-hidden="true" />
      </div>
      <div className={`container ${styles.content}`}>
        {kicker && <p className={`mark ${styles.kicker}`}>{kicker}</p>}
        <h1 id="page-title" className="display">
          {title}
        </h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {children}
      </div>
      {media?.note && <p className={`cgi-note ${styles.note}`}>{media.note}</p>}
    </section>
  );
}

/** A quieter opening for pages that are mostly reading. */
export function PageHeader({ kicker, title, lede }: { kicker: string; title: ReactNode; lede?: string }) {
  return (
    <header className={`container ${styles.header}`}>
      {kicker && <p className={`mark ${styles.kicker}`}>{kicker}</p>}
      <h1 id="page-title" className="display">
        {title}
      </h1>
      {lede && <p className="lead">{lede}</p>}
    </header>
  );
}

/** A CMS title written with "|" for its break, set as the site sets titles: second line italic. */
export function TitleLines({ lines }: { lines: string[] }) {
  const [a, ...rest] = lines;
  const b = rest.join(' ');
  return (
    <>
      {a}
      {b && (
        <>
          <br />
          <span className="italic">{b}</span>
        </>
      )}
    </>
  );
}
