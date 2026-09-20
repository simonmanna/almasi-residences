import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';

/**
 * §SEO — the articles and location pages are written as Markdown in the admin.
 *
 * They are rendered here rather than by a library because the site accepts a
 * deliberately small subset: headings, paragraphs, lists, quotes, links and
 * emphasis. Raw HTML is never interpreted, so admin copy cannot inject markup
 * into the page — and the output is plain elements a crawler reads as prose.
 */

/** Headings become the page's h2/h3, so the document outline stays readable. */
export function renderMarkdown(markdown: string | null | undefined): ReactNode {
  if (!markdown?.trim()) return null;
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block, i) => {
    const text = block.trim();
    if (!text) return null;

    const heading = /^(#{1,4})\s+(.*)$/.exec(text);
    if (heading) {
      const level = Math.min(heading[1]!.length + 1, 4);
      const Tag = (`h${level}` as 'h2' | 'h3' | 'h4');
      return (
        <Tag key={i} className={level === 2 ? 'title-xs' : 'h3'}>
          {inline(heading[2]!)}
        </Tag>
      );
    }

    if (/^>\s+/.test(text)) {
      return (
        <blockquote key={i}>
          <p className="lead">{inline(text.replace(/^>\s?/gm, ''))}</p>
        </blockquote>
      );
    }

    const lines = text.split('\n');
    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j}>{inline(l.trim().replace(/^[-*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    if (lines.every((l) => /^\d+[.)]\s+/.test(l.trim()))) {
      return (
        <ol key={i}>
          {lines.map((l, j) => (
            <li key={j}>{inline(l.trim().replace(/^\d+[.)]\s+/, ''))}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={i} className="body">
        {inline(text)}
      </p>
    );
  });
}

/** Links, bold and italic — everything else is printed as written. */
function inline(text: string): ReactNode {
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] && m[2]) {
      const href = m[2];
      // An internal link is a Link, so it prefetches and keeps the transition.
      out.push(
        href.startsWith('/') ? (
          <Link key={key++} href={href}>
            {m[1]}
          </Link>
        ) : (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {m[1]}
          </a>
        ),
      );
    } else if (m[3]) out.push(<strong key={key++}>{m[3]}</strong>);
    else if (m[4] ?? m[5]) out.push(<em key={key++}>{m[4] ?? m[5]}</em>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

/** The same text with its marks removed — for a meta description or JSON-LD. */
export function plainText(markdown: string | null | undefined, max = 300): string {
  if (!markdown) return '';
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\-*]\s?/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trimEnd()}…`;
}
