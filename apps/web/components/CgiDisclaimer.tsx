/**
 * §13 — every CG image carries this, readable, next to the image. Not in the
 * footer. The site sells a building that does not exist yet; a render without
 * this line is a misrepresentation.
 */
export function CgiDisclaimer({ className }: { className?: string }) {
  return (
    <p className={className} data-cgi-disclaimer>
      Computer-generated image. Final finishes, layout and views subject to change.
    </p>
  );
}
