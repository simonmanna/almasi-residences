'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { prefersLightMedia, useReducedMotion } from '../../lib/motion';
import { SceneImage } from './SceneImage';

/**
 * A placement that moves when it can. The still is always there (server-
 * rendered, the LCP candidate, the reduced-motion and Save-Data answer); the
 * film is fetched only near the viewport, fades in over the still once it can
 * play, and plays while `active`. Both come from the admin's media library.
 */
export function MotionMedia({
  image,
  video,
  sizes = '100vw',
  priority = false,
  active = true,
  loop = false,
  restartOnActive = false,
  load = true,
  label,
  className,
  onEnded,
}: {
  image: PublicMediaDto | null | undefined;
  video?: PublicMediaDto | null;
  sizes?: string;
  priority?: boolean;
  active?: boolean;
  loop?: boolean;
  /** Start from the first frame each time the scene becomes active. */
  restartOnActive?: boolean;
  /**
   * Whether the film may be fetched at all. Stacked stages (the story, the
   * tour) pass true only for the current scene and its neighbours, so a
   * visitor downloads what they are about to watch, not the whole reel.
   */
  load?: boolean;
  label?: string;
  className?: string;
  onEnded?: () => void;
}) {
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const src = video?.kind === 'VIDEO' ? video.url : null;

  useEffect(() => {
    setAllowed(Boolean(src) && !reduced && !prefersLightMedia());
  }, [src, reduced]);

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
      <SceneImage media={image} sizes={sizes} priority={priority} label={label} />
      {src && allowed && near && load && (
        <video
          ref={videoRef}
          className="motion-media-video"
          src={src}
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
