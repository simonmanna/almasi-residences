'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[almasi] Page error:', error);
  }, [error]);

  return (
    <main id="main">
      <section
        className="container"
        style={{ paddingBlock: 'calc(var(--nav-h) + 120px) var(--section-y)' }}
      >
        <p className="mark" style={{ color: 'var(--accent)', marginBottom: 24 }}>
          Error
        </p>
        <h1 className="display" style={{ marginBottom: 32 }}>
          We&rsquo;ll be
          <br />
          <span className="italic">right back.</span>
        </h1>
        <p className="lead" style={{ marginBottom: 12 }}>
          Something unexpected happened. The sales team is still at their desks —
          you can reach them directly.
        </p>
        {error.digest && (
          <p className="caption" style={{ marginBottom: 40, fontVariantNumeric: 'tabular-nums' }}>
            Ref: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="button" className="btn btn--solid" onClick={reset}>
            Try again
          </button>
          <Link href="/residences" className="btn btn--ghost">
            See the residences
          </Link>
          <Link href="/" className="btn btn--ghost">
            Back to the start
          </Link>
        </div>
      </section>
    </main>
  );
}