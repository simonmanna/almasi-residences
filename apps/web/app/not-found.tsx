import Link from 'next/link';
import { SiteFooter } from '../components/layout/SiteFooter';

export default function NotFound() {
  return (
    <main id="main">
      <section className="container" style={{ paddingBlock: 'calc(var(--nav-h) + 120px) var(--section-y)' }}>
        <p className="mark" style={{ color: 'var(--accent)', marginBottom: 24 }}>
          Not found
        </p>
        <h1 className="display" style={{ marginBottom: 32 }}>
          This door
          <br />
          <span className="italic">leads nowhere.</span>
        </h1>
        <p className="lead" style={{ marginBottom: 40 }}>
          The page may have moved when the site was rebuilt. Every residence is still one click away.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Link href="/residences" className="btn btn--solid">
            See the residences
          </Link>
          <Link href="/" className="btn btn--ghost">
            Back to the start
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
