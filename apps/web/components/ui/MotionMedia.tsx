'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { scene, type SceneId } from '../../lib/media-manifest';
import { prefersLightMedia, prefersSmallMedia, useReducedMotion } from '../../lib/motion';
import { SceneImage } from './SceneImage';

/**
 * A scene that moves when it can. The still is always there (server-rendered,
 * the LCP candidate, the reduced-motion and Save-Data answer); the film is
 * fetched only near the viewport, fades in over the still once it can play,
 * and plays while `active`.
 */
export function MotionMedia({
  id,
  sizes = '100vw',
  priority = false,
  active = true,
  loop = false,
  restartOnActive = false,
  base = 'still',
  load = true,
  className,
  onEnded,
}: {
  id: SceneId;
  sizes?: string;
  priority?: boolean;
  active?: boolean;
  loop?: boolean;
  /** Start from the first frame each time the scene becomes active. */
  restartOnActive?: boolean;
  /**
   * What sits under the film: the scene's still, or the film's own first
   * frame — for a film that begins somewhere other than the still (the hero's
   * pull-back opens on a balcony detail).
   */
  base?: 'still' | 'poster';
  /**
   * Whether the film may be fetched at all. Stacked stages (the story, the
   * tour) pass true only for the current scene and its neighbours, so a
   * visitor downloads what they are about to watch, not the whole reel.
   */
  load?: boolean;
  className?: string;
  onEnded?: () => void;
}) {
  const s = scene(id);
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!s.video || reduced || prefersLightMedia()) {
      setSrc(null);
      return;
    }
    setSrc(prefersSmallMedia() ? s.video.sd : s.video.hd);
  }, [s.video, reduced]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '60% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ready) return;
    if (active) {
      if (restartOnActive) v.currentTime = 0;
      void v.play().catch(() => {
        /* autoplay refused (Low Power Mode): the still remains */
      });
    } else {
      v.pause();
    }
  }, [active, ready, restartOnActive]);

  return (
    <div ref={hostRef} className={`motion-media ${className ?? ''}`} data-playing={ready && active ? 'true' : 'false'}>
      {base === 'poster' && s.video && src !== null ? (
        <Image
          src={s.video.poster}
          alt={s.alt}
          fill
          sizes={sizes}
          priority={priority}
          quality={75}
          style={{ objectFit: 'cover', objectPosition: s.focus ?? '50% 50%' }}
        />
      ) : (
        <SceneImage id={id} sizes={sizes} priority={priority} />
      )}
      {src && near && load && (
        <video
          ref={videoRef}
          className="motion-media-video"
          src={src}
          poster={s.video?.poster}
          muted
          playsInline
          loop={loop}
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          onCanPlay={() => setReady(true)}
          onEnded={onEnded}
        />
      )}
    </div>
  );
}
