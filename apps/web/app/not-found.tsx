import Link from 'next/link';

/** §10 — brand-quality 404. Matches the site's design language precisely. */
export default function NotFound() {
  return (
    <main id="main">
      <section
        className="container"
        style={{ paddingBlock: 'calc(var(--nav-h) + 120px) var(--section-y)' }}
        data-ground="stone"
      >
        <p
          className="mark"
          style={{ color: 'var(--accent)', marginBottom: 'var(--space-5)' }}
        >
          Not found
        </p>
        <h1
          className="display"
          style={{
            marginBottom: 'var(--space-6)',
            maxWidth: '14ch',
          }}
        >
          This door
          <br />
          <span className="italic">leads nowhere.</span>
        </h1>
        <p
          className="lead"
          style={{
            marginBottom: 'var(--space-7)',
            maxWidth: '56ch',
          }}
        >
          The page may have moved when the site was rebuilt. Every residence is
          still one click away — or the sales team is just a message from finding
          the right one.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Link href="/residences" className="btn btn--solid">
            See the residences
          </Link>
          <Link href="/tour" className="btn btn--ghost">
            Take the tour
          </Link>
          <Link href="/" className="btn btn--ghost">
            Back to the start
          </Link>
        </div>
      </section>
    </main>
  );
}