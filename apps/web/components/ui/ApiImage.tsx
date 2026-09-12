import type { PublicMediaDto } from '../../lib/api';

/**
 * An image from the admin's media library, cover-fitted like SceneImage. The
 * API already rendered it to WebP at a ladder of widths (§33), so this is a
 * plain <img> with that srcset — no second optimisation pass — lazy by
 * default, with the blur placeholder painted underneath.
 */
export function ApiImage({
  m,
  sizes = '100vw',
  priority = false,
  focus,
  className,
}: {
  m: PublicMediaDto;
  sizes?: string;
  priority?: boolean;
  focus?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already optimised by the API
    <img
      src={m.url}
      srcSet={m.srcSet ?? undefined}
      sizes={sizes}
      alt={m.altText ?? m.title ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: focus ?? '50% 50%',
        backgroundImage: m.blurDataUrl ? `url(${m.blurDataUrl})` : undefined,
        backgroundSize: 'cover',
      }}
    />
  );
}
