import styles from '../../skeleton.module.css';

/** The shape of the list, held for the moment before the inventory arrives. */
export default function Loading() {
  return (
    <main id="main" className="container">
      <div className={styles.page} aria-busy="true" aria-label="Loading residences">
        <span className={`${styles.bar} ${styles.kicker}`} />
        <span className={`${styles.bar} ${styles.title}`} />
        <span className={`${styles.bar} ${styles.lede}`} />
        <div className={styles.rows}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.thumb} />
              <span className={`${styles.bar} ${styles.code}`} />
              <span className={`${styles.bar} ${styles.cell}`} />
              <span className={`${styles.bar} ${styles.cell}`} />
              <span className={`${styles.bar} ${styles.price}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
