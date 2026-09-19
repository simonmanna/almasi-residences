import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Environment } from '../../../lib/digital-twin';

export interface Preset {
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  sun: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  exposure: number;
  fog: THREE.Color;
  fogDensity: number;
  env: number;
  night: number;
  interior: number;
  lamp: number;
  pool: number;
  bloom: number;
  clouds: number;
}

const c = (hex: string) => new THREE.Color(hex);

/** Sun from the west-south-west at golden hour, so the street face glows and the sky burns behind. */
export const PRESETS: Record<Environment, Preset> = {
  day: {
    elevation: 58, azimuth: 330, turbidity: 2.6, rayleigh: 1.1, mie: 0.004,
    sun: c('#FFF4E4'), sunIntensity: 2.4, hemiSky: c('#CFE2FF'), hemiGround: c('#5B5647'), hemi: 0.4,
    exposure: 0.4, fog: c('#C4D3DE'), fogDensity: 0.0009, env: 0.5, night: 0,
    interior: 0.35, lamp: 0.05, pool: 0.35, bloom: 0.12, clouds: 0.35,
  },
  sunset: {
    elevation: 7, azimuth: 292, turbidity: 7.5, rayleigh: 2.8, mie: 0.009,
    sun: c('#FFA868'), sunIntensity: 3.1, hemiSky: c('#FFC49A'), hemiGround: c('#3B2C24'), hemi: 0.38,
    exposure: 0.68, fog: c('#B98C74'), fogDensity: 0.0022, env: 0.42, night: 0.12,
    interior: 0.9, lamp: 1, pool: 0.8, bloom: 0.42, clouds: 0.5,
  },
  night: {
    elevation: -9, azimuth: 250, turbidity: 3, rayleigh: 0.6, mie: 0.004,
    sun: c('#A9BEFF'), sunIntensity: 0.55, hemiSky: c('#3A5278'), hemiGround: c('#121316'), hemi: 0.42,
    exposure: 1.0, fog: c('#0F1827'), fogDensity: 0.0026, env: 0.18, night: 1,
    interior: 1.1, lamp: 1.3, pool: 1.2, bloom: 0.7, clouds: 0.25,
  },
};

function lerpPreset(a: Preset, b: Preset, t: number): Preset {
  const out = {} as Preset;
  for (const k of Object.keys(a) as (keyof Preset)[]) {
    const va = a[k];
    const vb = b[k];
    if (va instanceof THREE.Color) (out as unknown as Record<string, unknown>)[k] = va.clone().lerp(vb as THREE.Color, t);
    else (out as unknown as Record<string, unknown>)[k] = (va as number) + ((vb as number) - (va as number)) * t;
  }
  return out;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** The sky dome, the sun and moon, fill light and reflections. */
export class Atmosphere {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight('#ffffff', 3);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#333333', 1);
  readonly group = new THREE.Group();
  current: Preset = { ...PRESETS.sunset };
  private from: Preset = PRESETS.sunset;
  private to: Preset = PRESETS.sunset;
  private t = 1;
  private stars: THREE.Points;
  private nightDome: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky: Sky;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private roomTarget: THREE.WebGLRenderTarget;
  private envClock = 0;
  readonly sunDir = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.sky.scale.setScalar(4000);
    this.group.add(this.sky);
    // A deep blue dome for after dusk, blended over the physical sky.
    this.nightDome = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: { opacity: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader:
          'uniform float opacity; varying vec3 vP; void main(){ float h = clamp(vP.y,0.,1.); vec3 top = vec3(0.012,0.02,0.05); vec3 hor = vec3(0.09,0.12,0.2); vec3 glow = vec3(0.35,0.2,0.12)*pow(1.-h,10.); gl_FragColor = vec4(mix(hor, top, pow(h,0.45)) + glow, opacity); }',
      }),
    );
    this.group.add(this.nightDome);
    const pos: number[] = [];
    let s = 99;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2200; i++) {
      const u = r() * Math.PI * 2;
      const v = Math.acos(r() * 0.95);
      pos.push(Math.sin(v) * Math.cos(u) * 3500, Math.cos(v) * 3500, Math.sin(v) * Math.sin(u) * 3500);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#FFFFFF', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.group.add(this.stars);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.aimShadow('exterior');
    this.group.add(this.sun, this.sun.target, this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.roomTarget = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
  }

  /** A tight shadow frustum where the visitor is looking. */
  aimShadow(where: 'exterior' | 'interior', center = new THREE.Vector3(), radius?: number) {
    const cam = this.sun.shadow.camera;
    const r = radius ?? (where === 'exterior' ? 62 : 14);
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = where === 'exterior' ? 320 : 90;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(center);
    this.sun.userData.center = center.clone();
    this.sun.userData.distance = where === 'exterior' ? 150 : 45;
  }

  set(env: Environment, instant = false) {
    this.from = { ...this.current };
    this.to = PRESETS[env];
    this.t = instant ? 1 : 0;
    if (instant) this.apply(this.to, true);
  }

  /** Returns true while a transition is running. */
  update(dt: number, scene: THREE.Scene, interior: boolean) {
    let changed = false;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 2.2);
      this.apply(lerpPreset(this.from, this.to, ease(this.t)), false);
      changed = true;
      this.envClock += dt;
      if (this.envClock > 0.3 || this.t >= 1) {
        this.envClock = 0;
        this.refreshEnv();
      }
    }
    scene.environment = interior ? this.roomTarget.texture : (this.envTarget?.texture ?? null);
    scene.environmentIntensity = interior ? 0.25 + this.current.env * 0.55 : this.current.env;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(this.current.fog);
      fog.density = interior ? this.current.fogDensity * 0.5 : this.current.fogDensity;
    }
    return changed;
  }

  private apply(p: Preset, refresh: boolean) {
    this.current = p;
    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity!.value = p.turbidity;
      u.rayleigh!.value = p.rayleigh;
      u.mieCoefficient!.value = p.mie;
      u.mieDirectionalG!.value = 0.86;
      u.sunPosition!.value.copy(this.sunDir);
      if (u.cloudCoverage) u.cloudCoverage.value = p.clouds;
      if (u.cloudDensity) u.cloudDensity.value = 0.45;
    }
    // Below the horizon the key light becomes the moon, from high in the east.
    const light = p.elevation > 0 ? this.sunDir.clone() : new THREE.Vector3(0.45, 0.8, -0.35).normalize();
    const center = (this.sun.userData.center as THREE.Vector3 | undefined) ?? new THREE.Vector3();
    const dist = (this.sun.userData.distance as number | undefined) ?? 150;
    this.sun.position.copy(center).addScaledVector(light, dist);
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.renderer.toneMappingExposure = p.exposure;
    (this.nightDome.material as THREE.ShaderMaterial).uniforms.opacity!.value = Math.min(1, Math.max(0, p.night - 0.1) * 1.15);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, p.night - 0.5) * 2;
    if (refresh) this.refreshEnv();
  }

  /** Re-aims the key light after the shadow frustum moves. */
  reaim() {
    this.apply(this.current, false);
  }

  private refreshEnv() {
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    old?.dispose();
  }

  time(t: number) {
    const u = this.sky.material.uniforms;
    if (u.time) u.time.value = t;
  }

  dispose() {
    this.envTarget?.dispose();
    this.roomTarget.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.envSky.geometry.dispose();
    (this.envSky.material as THREE.Material).dispose();
    this.nightDome.geometry.dispose();
    (this.nightDome.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}
