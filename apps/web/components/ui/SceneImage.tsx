import type { PublicMediaDto } from '../../lib/api';
import { ApiImage } from './ApiImage';

/**
 * A still from the admin's media library, cover-fitted — or, when the admin has
 * not chosen one, a neutral frame that says so.
 *
 * Roadmap items 16–17: before this, the site drew from a static manifest of 24
 * renders and fell back to one of them whenever the library had nothing, so a
 * missing photograph looked like the wrong photograph. There is no substitute
 * any more; an empty placement is visibly, intentionally empty.
 */
export function SceneImage({
  media,
  sizes = '100vw',
  priority = false,
  focus,
  label,
  className,
}: {
  media: PublicMediaDto | null | undefined;
  sizes?: string;
  priority?: boolean;
  focus?: string;
  /** Printed in the empty frame, so a manager previewing the site knows what belongs here. */
  label?: string;
  className?: string;
}) {
  if (!media || media.kind !== 'IMAGE') return <MediaEmpty label={label} className={className} />;
  return <ApiImage m={media} sizes={sizes} priority={priority} focus={focus ?? media.focus ?? undefined} className={className} />;
}

export function MediaEmpty({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`media-empty ${className ?? ''}`} role="img" aria-label={label ? `${label}: image to follow` : 'Image to follow'}>
      {label && <span className="mark">{label}</span>}
      <span>Image to follow</span>
    </div>
  );
}

/** The provenance note printed beside a file (§49); empty for a photograph or no file. */
export const noteFor = (m: PublicMediaDto | null | undefined): string => m?.note ?? '';
