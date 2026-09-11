'use client';

import { createElement, Fragment, useEffect, useRef, type ElementType } from 'react';

/**
 * A headline that rises into place, line by line, the first time it enters the
 * viewport. The words are in the server HTML from the start (search engines and
 * screen readers get the plain sentence); only the transform is animated, and
 * a <noscript> rule in the layout keeps it visible if JavaScript never runs.
 */
export function RevealText({
  as = 'h2',
  lines,
  className,
  id,
  delay = 0,
}: {
  as?: ElementType;
  /** One entry per visual line. */
  lines: string[];
  className?: string;
  id?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.dataset.revealed = 'true';
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  let word = 0;
  return createElement(
    as,
    {
      ref,
      id,
      className: `reveal ${className ?? ''}`,
      'data-revealed': 'false',
      style: { '--reveal-delay': `${delay}ms` } as React.CSSProperties,
    },
    lines.map((line, li) => (
      <span key={li} className="reveal-line">
        {line.split(' ').map((w, wi, arr) => {
          const i = word++;
          // The space sits between the spans: inside an inline-block it would collapse.
          return (
            <Fragment key={wi}>
              <span className="reveal-word" style={{ '--i': i } as React.CSSProperties}>
                {w}
              </span>
              {wi < arr.length - 1 ? ' ' : null}
            </Fragment>
          );
        })}
        {li < lines.length - 1 ? ' ' : null}
      </span>
    )),
  );
}
