import { draftMode } from 'next/headers';
import styles from './PreviewBanner.module.css';

/** Unmissable while previewing drafts, so a preview is never mistaken for the live site. */
export async function PreviewBanner() {
  if (!(await draftMode()).isEnabled) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span>
        Preview — you are seeing unpublished drafts. <strong>Visitors do not see this.</strong>
      </span>
      <a href="/api/draft/exit" className={styles.exit}>
        Exit preview
      </a>
    </div>
  );
}
