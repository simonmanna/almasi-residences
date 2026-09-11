/**
 * The Almasi mark: two ridgelines, one behind the other — Kigali's hills, and
 * the facets of the diamond the name means in Swahili. Drawn as strokes so it
 * takes the colour of whatever ground it sits on.
 */
export function Wordmark({ withName = true, size = 38 }: { withName?: boolean; size?: number }) {
  return (
    <span className="wordmark">
      <svg
        viewBox="0 0 44 26"
        width={size}
        height={Math.round((size * 26) / 44)}
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="miter"
      >
        <path d="M1 25 L13.5 9.5 L20.5 18" />
        <path d="M5.5 25 L13.5 15 L18 20.5" />
        <path d="M12 25 L27 3 L43 25" />
        <path d="M17.5 25 L27 11 L37 25" />
      </svg>
      {withName && <span className="wordmark-name">ALMASI</span>}
    </span>
  );
}
