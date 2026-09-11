import Image from 'next/image';
import { scene, type SceneId } from '../../lib/media-manifest';

/**
 * A scene as a responsive, cover-fitted image. next/image serves AVIF/WebP at
 * the right width for `sizes`; the blur placeholder is generated with the
 * rendition, so a slow connection sees the room's colour at once, not a hole.
 */
export function SceneImage({
  id,
  sizes = '100vw',
  priority = false,
  quality = 75,
  alt,
  focus,
  className,
}: {
  id: SceneId;
  sizes?: string;
  priority?: boolean;
  quality?: 60 | 70 | 75 | 82;
  alt?: string;
  focus?: string;
  className?: string;
}) {
  const s = scene(id);
  return (
    <Image
      src={s.src}
      alt={alt ?? s.alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={quality}
      placeholder="blur"
      blurDataURL={s.blur}
      className={className}
      style={{ objectFit: 'cover', objectPosition: focus ?? s.focus ?? '50% 50%' }}
    />
  );
}
