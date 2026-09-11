'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * §8.7 — the splat renderer, isolated behind its own dynamic import so
 * @sparkjsdev/spark is never in the main bundle. It is only reached after an
 * explicit "Enter immersive view", which is what SplatScene enforces.
 *
 * Spark is not a dependency yet: there is no captured scene to render, and
 * adding a renderer for content that does not exist puts weight in the
 * lockfile for no benefit. The import is resolved at runtime, and a missing
 * package degrades to the message below rather than a broken page.
 */
export function SparkViewer({
  url,
  label,
  onExit,
}: {
  url: string;
  label: string;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        const specifier = '@sparkjsdev/spark';
        const spark = (await import(specifier)) as {
          SplatMesh?: new (opts: { url: string }) => unknown;
        };
        if (disposed || !hostRef.current) return;
        if (!spark.SplatMesh) throw new Error('Spark did not expose SplatMesh');

        const three = await import('three');
        const renderer = new three.WebGLRenderer({ antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const { width, height } = hostRef.current.getBoundingClientRect();
        renderer.setSize(width, height, false);
        hostRef.current.appendChild(renderer.domElement);

        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(0, 1.6, 3);
        scene.add(new spark.SplatMesh({ url }) as never);

        let frame = 0;
        const tick = () => {
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();

        cleanup = () => {
          cancelAnimationFrame(frame);
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [url]);

  if (error) {
    return (
      <div className="splat-gate">
        <p className="prose">
          The immersive viewer is not installed in this build. Run{' '}
          <code>pnpm --filter @avida/web add @sparkjsdev/spark</code> once there is a captured
          scene to show.
        </p>
        <button type="button" className="button-quiet" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="splat-viewer">
      <div ref={hostRef} className="splat-canvas" role="img" aria-label={label} />
      <button type="button" className="button-quiet" onClick={onExit}>
        Leave immersive view
      </button>
    </div>
  );
}
