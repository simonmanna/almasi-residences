'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(error.digest ?? null);
    console.error('[almasi] Global error:', error);
  }, [error]);

  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#151613" />
        <title>Something went wrong — Almasi Residence, Kigali</title>
        <style>{`*{margin:0;padding:0;box-sizing:border-box}html{background:#151613;color:#efebe3;font-family:system-ui,-apple-system,sans-serif;font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}body{min-height:100vh;display:grid;place-items:center;padding:20px;text-align:center}.mark{font-size:0.875rem;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:0.16em;color:#a8a396;margin-bottom:1.5rem}h1{font-family:Georgia,'Iowan Old Style',serif;font-size:clamp(2.25rem,1.4rem+3vw,4.5rem);line-height:0.98;letter-spacing:-0.028em;margin-bottom:1rem}.lead{font-size:clamp(1.1875rem,1.05rem+0.55vw,1.5rem);max-width:44ch;color:#a8a396;margin-bottom:2.5rem}.actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}a{color:inherit;text-decoration:none}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 30px;border:1px solid rgba(239,235,227,0.55);border-radius:2px;font-size:0.9375rem;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:0.16em;line-height:1;white-space:nowrap;transition:color 0.64s cubic-bezier(0.16,1,0.3,1),border-color 0.64s cubic-bezier(0.16,1,0.3,1);position:relative;overflow:hidden;isolation:isolate}.btn::before{content:'';position:absolute;inset:-1px;z-index:-1;background:var(--c,#efebe3);transform:scaleY(0);transform-origin:50% 100%;transition:transform 0.64s cubic-bezier(0.16,1,0.3,1)}.btn:hover{border-color:var(--c,#efebe3)}.btn:hover::before,.btn:focus-visible::before{transform:scaleY(1)}.btn--solid{--c:#efebe3;color:#151613}.btn--solid:hover,.btn--solid:focus-visible{color:#151613}.btn--ghost{color:#efebe3;border-color:rgba(239,235,227,0.3)}.digest{font-size:0.6875rem;color:#6a675f;margin-top:3rem;font-variant-numeric:tabular-nums}`}</style>
      </head>
      <body>
        <main>
          <p className="mark">Error</p>
          <h1>We&rsquo;ll be<br />right back.</h1>
          <p className="lead">
            Something unexpected happened. The sales team is still at their desks —
            you can reach them directly.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--solid" onClick={reset}>
              Try again
            </button>
            <a href="/" className="btn btn--ghost">
              Back to the start
            </a>
          </div>
          {id && <p className="digest">Ref: {id}</p>}
        </main>
      </body>
    </html>
  );
}