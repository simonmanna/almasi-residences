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
  /** The painted sky: zenith, the band above the horizon, the horizon itself, and the light around the sun. */
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  skyGlow: THREE.Color;
  skyGlowAmount: number;
  cloudTint: THREE.Color;
}

const c = (hex: string) => new THREE.Color(hex);

const DOME_VERTEX = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/**
 * The sky, painted rather than simulated: a three-stop gradient, a wash of
 * light around the sun, and slow clouds that take its colour. It reads well in
 * every direction, which a physical sky at dusk does not — the half facing away
 * from the sun goes grey.
 */
const DOME_FRAGMENT = `
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 haze; uniform vec3 glow; uniform vec3 cloud;
uniform vec3 sunDir; uniform float glowAmount; uniform float clouds; uniform float time; uniform float gain;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // The camera looks down on the building, so most of the sky it sees is the low sky: the colour is spent there.
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.13, h));
  col = mix(col, top, smoothstep(0.1, 0.55, h));
  vec3 s = normalize(sunDir);
  float toward = max(dot(normalize(d.xz + 1e-5), normalize(s.xz + 1e-5)), 0.0);
  float low = exp(-max(h, 0.0) * 5.5);
  col += glow * glowAmount * (pow(max(dot(d, s), 0.0), 28.0) * 1.1 + pow(toward, 2.5) * low * 0.6 + low * 0.12);
  vec2 uv = d.xz / (max(h, 0.0) + 0.28) * 1.1 + vec2(time * 0.0035, time * 0.0012);
  float body = fbm(uv * 0.9);
  float cover = smoothstep(0.98 - clouds, 1.26 - clouds, body) * smoothstep(0.02, 0.12, h);
  // Each cloud has a lit side that takes the sun's colour and a cool underside.
  vec3 under = cloud * 0.55 + top * 0.25;
  vec3 lit = cloud + glow * glowAmount * 0.45 * pow(toward, 2.0);
  col = mix(col, mix(under, lit, smoothstep(0.25, 0.75, fbm(uv * 2.7 + 5.0))), cover * 0.85);
  // The far ground dissolves into the same haze the fog paints the hills with.
  col = mix(haze, col, smoothstep(-0.03, 0.035, h));
  gl_FragColor = vec4(col * gain, 1.0);
}`;

/** Sun from the west-south-west at golden hour, so the street face glows and the sky burns behind. */
export const PRESETS: Record<Environment, Preset> = {
  day: {
    elevation: 58, azimuth: 330, turbidity: 2.6, rayleigh: 1.1, mie: 0.004,
    sun: c('#FFF4E4'), sunIntensity: 2.4, hemiSky: c('#CFE2FF'), hemiGround: c('#5B5647'), hemi: 0.4,
    exposure: 0.4, fog: c('#C4D3DE'), fogDensity: 0.0009, env: 0.5, night: 0,
    interior: 0.35, lamp: 0.05, pool: 0.35, bloom: 0.12, clouds: 0.42,
    skyTop: c('#1F5CC4'), skyMid: c('#5F9FE8'), skyHorizon: c('#CFE4F5'), skyGlow: c('#FFF6E2'), skyGlowAmount: 0.3, cloudTint: c('#FFFFFF'),
  },
  sunset: {
    elevation: 7, azimuth: 292, turbidity: 7.5, rayleigh: 2.8, mie: 0.009,
    sun: c('#FFA868'), sunIntensity: 3.1, hemiSky: c('#FFC49A'), hemiGround: c('#3B2C24'), hemi: 0.38,
    exposure: 0.68, fog: c('#8B7FA6'), fogDensity: 0.002, env: 0.42, night: 0.12,
    interior: 0.9, lamp: 1, pool: 0.8, bloom: 0.42, clouds: 0.55,
    skyTop: c('#243F9E'), skyMid: c('#8E6CC2'), skyHorizon: c('#FFAE78'), skyGlow: c('#FF8438'), skyGlowAmount: 1, cloudTint: c('#FF9FB0'),
  },
  night: {
    elevation: -9, azimuth: 250, turbidity: 3, rayleigh: 0.6, mie: 0.004,
    sun: c('#A9BEFF'), sunIntensity: 0.55, hemiSky: c('#3A5278'), hemiGround: c('#121316'), hemi: 0.42,
    exposure: 1.0, fog: c('#0F1827'), fogDensity: 0.0026, env: 0.18, night: 1,
    interior: 1.1, lamp: 1.3, pool: 1.2, bloom: 0.7, clouds: 0.3,
    skyTop: c('#03060F'), skyMid: c('#0A1733'), skyHorizon: c('#2A3A60'), skyGlow: c('#7A4426'), skyGlowAmount: 0.45, cloudTint: c('#1C2947'),
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
  readonly sun = new THREE.DirectionalLight('#ffffff', 3);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#333333', 1);
  readonly group = new THREE.Group();
  current: Preset = { ...PRESETS.sunset };
  private from: Preset = PRESETS.sunset;
  private to: Preset = PRESETS.sunset;
  private t = 1;
  private stars: THREE.Points;
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky: Sky;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private roomTarget: THREE.WebGLRenderTarget;
  private envClock = 0;
  readonly sunDir = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          mid: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          haze: { value: new THREE.Color() },
          glow: { value: new THREE.Color() },
          cloud: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          glowAmount: { value: 1 },
          clouds: { value: 0.5 },
          time: { value: 0 },
          gain: { value: 1 },
        },
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
      }),
    );
    this.dome.renderOrder = -1;
    this.group.add(this.dome);
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
    // Reflections still come from a physical sky; the eye sees the painted one.
    const e = this.envSky.material.uniforms;
    e.turbidity!.value = p.turbidity;
    e.rayleigh!.value = p.rayleigh;
    e.mieCoefficient!.value = p.mie;
    e.mieDirectionalG!.value = 0.86;
    e.sunPosition!.value.copy(this.sunDir);
    const u = this.dome.material.uniforms;
    u.top!.value.copy(p.skyTop);
    u.mid!.value.copy(p.skyMid);
    u.horizon!.value.copy(p.skyHorizon);
    u.haze!.value.copy(p.fog);
    u.glow!.value.copy(p.skyGlow);
    u.cloud!.value.copy(p.cloudTint);
    u.glowAmount!.value = p.skyGlowAmount;
    u.clouds!.value = p.clouds;
    // Below the horizon the glow stays where the sun went down.
    u.sunDir!.value.set(this.sunDir.x, Math.max(this.sunDir.y, 0.02), this.sunDir.z);
    // The colours above are the ones meant to reach the screen, whatever the exposure the scene needs.
    u.gain!.value = 1 / p.exposure;
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
    this.dome.material.uniforms.time!.value = t;
  }

  dispose() {
    this.envTarget?.dispose();
    this.roomTarget.dispose();
    this.pmrem.dispose();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.envSky.geometry.dispose();
    (this.envSky.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}
