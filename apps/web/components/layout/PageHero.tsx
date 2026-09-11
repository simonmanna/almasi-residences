import type { ReactNode } from 'react';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { SceneImage } from '../ui/SceneImage';
import styles from './PageHero.module.css';

/** The opening of an inner page: one scene, full bleed, and its title set over it. */
export function PageHero({
  sceneId,
  kicker,
  title,
  lede,
  children,
}: {
  sceneId: SceneId;
  kicker: string;
  title: ReactNode;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.hero} data-ground="night" data-nav-over aria-labelledby="page-title">
      <div className={styles.media}>
        <SceneImage id={sceneId} priority sizes="100vw" />
        <div className={styles.shade} aria-hidden="true" />
      </div>
      <div className={`container ${styles.content}`}>
        <p className={`mark ${styles.kicker}`}>{kicker}</p>
        <h1 id="page-title" className="display">
          {title}
        </h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {children}
      </div>
      <p className={`cgi-note ${styles.note}`}>{PROVENANCE_NOTE[scene(sceneId).provenance]}</p>
    </section>
  );
}

/** A quieter opening for pages that are mostly reading. */
export function PageHeader({ kicker, title, lede }: { kicker: string; title: ReactNode; lede?: string }) {
  return (
    <header className={`container ${styles.header}`}>
      <p className={`mark ${styles.kicker}`}>{kicker}</p>
      <h1 id="page-title" className="display">
        {title}
      </h1>
      {lede && <p className="lead">{lede}</p>}
    </header>
  );
}
