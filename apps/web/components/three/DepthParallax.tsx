'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * §8 F8 — the depth-parallax hero. A single plane with a displacement shader
 * driven by the depth map; the pointer (or device tilt) shifts the sampling.
 *
 * §7.4 — displacement is capped at 0.035 in normalised device coordinates.
 * Beyond that the edges of foreground geometry tear visibly, which on a
 * building render reads as a construction defect rather than an effect.
 */
const MAX_DISPLACEMENT = 0.035;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uPointer;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    // Depth is 0 (far) to 1 (near). Near pixels move most, which is what makes
    // the image read as layered rather than warped.
    float depth = texture2D(uDepth, vUv).r;
    vec2 offset = uPointer * uStrength * depth;
    gl_FragColor = texture2D(uImage, vUv + offset);
  }
`;

export function DepthParallax({
  imageSrc,
  depthSrc,
  className,
  alt,
}: {
  imageSrc: string;
  depthSrc: string;
  className?: string;
  alt: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const loader = new THREE.TextureLoader();
    const uniforms = {
      uImage: { value: loader.load(imageSrc) },
      uDepth: { value: loader.load(depthSrc) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uStrength: { value: MAX_DISPLACEMENT },
    };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms }),
    );
    scene.add(mesh);
    host.appendChild(renderer.domElement);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Target and current are separate so the movement eases rather than
    // snapping to the cursor — §2.6 allows response to user action, not motion
    // that happens on its own.
    const target = new THREE.Vector2(0, 0);
    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      target.set(
        ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      );
    };
    const onPointerLeave = () => target.set(0, 0);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    let frame = 0;
    const tick = () => {
      uniforms.uPointer.value.lerp(target, 0.08);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      mesh.geometry.dispose();
      (mesh.material as THREE.ShaderMaterial).dispose();
      uniforms.uImage.value.dispose();
      uniforms.uDepth.value.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [imageSrc, depthSrc]);

  // The canvas is decoration over content that exists elsewhere in the DOM, so
  // it carries the alt text as a label rather than being hidden outright.
  return <div ref={hostRef} className={className} role="img" aria-label={alt} />;
}
