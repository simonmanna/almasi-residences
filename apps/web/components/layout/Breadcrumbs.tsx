import Link from 'next/link';
import { breadcrumbJsonLd } from '../../lib/seo';
import styles from './Breadcrumbs.module.css';

export interface Crumb {
  name: string;
  path: string;
}

/**
 * §SEO — the trail, on the page and in structured data from the same list, so
 * what a search engine is told matches what a visitor can click. The last
 * crumb is the page itself and is not a link.
 */
export function Breadcrumbs({ items, ground }: { items: Crumb[]; ground?: 'quiet' | 'night' }) {
  if (items.length < 2) return null;
  return (
    <nav className={`container ${styles.wrap}`} aria-label="Breadcrumb" {...(ground ? { 'data-ground': ground } : {})}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(items)) }} />
      <ol className={styles.list}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.path} className={styles.item}>
              {last ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <>
                  <Link href={item.path} className="link-line">
                    {item.name}
                  </Link>
                  <span aria-hidden="true" className={styles.sep}>
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
