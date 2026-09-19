import * as THREE from 'three';
import * as T from './textures';

type Glow = 'interior' | 'lamp' | 'pool' | 'sign' | 'garden';

interface Entry {
  make: () => THREE.Material;
  glow?: Glow;
  /** Emissive intensity (standard) or colour scale (basic) at glow = 1. */
  base?: number;
}

/**
 * Every material the scene uses, by key. Building levels get their own clones
 * so a floor can fade out on its own; glow materials follow the time of day.
 */
export class Materials {
  private defs = new Map<string, Entry>();
  private cache = new Map<string, THREE.Material>();
  private byLevel = new Map<number, THREE.Material[]>();
  private glowing: { m: THREE.Material; glow: Glow; base: number; color?: THREE.Color }[] = [];
  private textures: THREE.Texture[] = [];
  readonly waterNormal: THREE.Texture;
  private wood: Record<'oak' | 'walnut', THREE.Texture>;

  constructor(maxAnisotropy: number) {
    const tex = <X extends THREE.Texture>(t: X, repeat?: [number, number]) => {
      t.anisotropy = Math.min(8, maxAnisotropy);
      if (repeat) t.repeat.set(...repeat);
      this.textures.push(t);
      return t;
    };
    const plaster = tex(T.plasterTexture());
    const walnut = tex(T.woodTexture('walnut'));
    const oak = tex(T.woodTexture('oak'));
    const teak = tex(T.woodTexture('teak'));
    const marble = tex(T.marbleTexture());
    const marbleDark = tex(T.marbleTexture(true));
    const paving = tex(T.pavingTexture());
    const travertine = tex(T.pavingTexture([206, 188, 160]));
    const stoneNormal = tex(T.normalFromNoise(8, 3));
    const foliage = tex(T.foliageTexture());
    const foliageNormal = tex(T.normalFromNoise(24, 5));
    this.waterNormal = tex(T.normalFromNoise(6, 6));
    this.wood = { oak, walnut };
    const cards = [0, 1, 2, 3].map((i) => tex(T.interiorCardTexture(i)));
    const sign = tex(T.signTexture('ALMASI RESIDENCE'));
    const scallop = tex(T.scallopTexture());
    const glow = tex(T.glowTexture());
    const boucle = tex(T.fabricTexture([236, 230, 219]));
    const linen = tex(T.fabricTexture([226, 214, 196]));
    const sage = tex(T.fabricTexture([150, 160, 136]));
    const terracotta = tex(T.fabricTexture([176, 104, 72]));
    const olive = tex(T.fabricTexture([104, 110, 66]));
    const taupe = tex(T.fabricTexture([186, 170, 150]));

    const std = (p: THREE.MeshStandardMaterialParameters) => () => new THREE.MeshStandardMaterial(p);
    const phys = (p: THREE.MeshPhysicalMaterialParameters) => () => new THREE.MeshPhysicalMaterial(p);
    const light = (r: number, g: number, b: number) => () => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: true });

    const defs: Record<string, Entry> = {
      // Architecture.
      plaster: { make: std({ color: '#F3EFE8', map: plaster, roughness: 0.86, normalMap: stoneNormal, normalScale: new THREE.Vector2(0.15, 0.15) }) },
      slab: { make: std({ color: '#F6F3EE', map: plaster, roughness: 0.8 }) },
      charcoal: { make: std({ color: '#4A4C50', roughness: 0.5, metalness: 0.15 }) },
      walnut: { make: std({ color: '#FFFFFF', map: walnut, roughness: 0.52 }) },
      oak: { make: std({ color: '#FFFFFF', map: oak, roughness: 0.55 }) },
      teak: { make: std({ color: '#FFFFFF', map: teak, roughness: 0.7 }) },
      frame: { make: std({ color: '#23221F', roughness: 0.35, metalness: 0.7 }) },
      brass: { make: std({ color: '#C8A064', roughness: 0.28, metalness: 1 }) },
      steel: { make: std({ color: '#B9BCBE', roughness: 0.3, metalness: 1 }) },
      stone: { make: std({ color: '#FFFFFF', map: travertine, roughness: 0.78, normalMap: stoneNormal, normalScale: new THREE.Vector2(0.3, 0.3) }) },
      paving: { make: std({ color: '#FFFFFF', map: paving, roughness: 0.72 }) },
      glass: {
        make: phys({
          color: '#1E2A2F',
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity: 0.38,
          envMapIntensity: 1.6,
          specularIntensity: 1,
          depthWrite: false,
        }),
      },
      clearGlass: {
        make: phys({ color: '#D8E6E8', roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
      },
      balustrade: {
        make: phys({ color: '#CFE3E5', roughness: 0.03, transparent: true, opacity: 0.2, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
      },
      card0: { make: std({ color: '#000000', emissive: '#FFFFFF', emissiveMap: cards[0], map: cards[0] }), glow: 'interior', base: 0.6 },
      card1: { make: std({ color: '#000000', emissive: '#FFFFFF', emissiveMap: cards[1], map: cards[1] }), glow: 'interior', base: 0.55 },
      card2: { make: std({ color: '#000000', emissive: '#FFFFFF', emissiveMap: cards[2], map: cards[2] }), glow: 'interior', base: 0.5 },
      card3: { make: std({ color: '#000000', emissive: '#FFFFFF', emissiveMap: cards[3], map: cards[3] }), glow: 'interior', base: 0.62 },
      sign: { make: std({ color: '#FFFFFF', map: sign, emissive: '#FFFFFF', emissiveMap: sign, roughness: 0.5 }), glow: 'sign', base: 1.6 },
      downlight: { make: light(3.2, 2.4, 1.6), glow: 'lamp', base: 1 },
      led: { make: light(2.2, 1.55, 0.95), glow: 'lamp', base: 1 },
      scallop: {
        make: () =>
          new THREE.MeshBasicMaterial({
            map: scallop,
            color: new THREE.Color(0.7, 0.52, 0.34),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        glow: 'lamp',
        base: 1,
      },
      glowSprite: {
        make: () =>
          new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(0.55, 0.4, 0.26), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        glow: 'garden',
        base: 1,
      },
      // Landscape.
      leaf: { make: std({ color: '#3E6A36', roughness: 0.75, side: THREE.DoubleSide }) },
      palmLeaf: { make: std({ color: '#4E7A3A', roughness: 0.7, side: THREE.DoubleSide }) },
      bark: { make: std({ color: '#6B5846', roughness: 0.95 }) },
      canopy: { make: std({ color: '#FFFFFF', map: foliage, normalMap: foliageNormal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92 }) },
      hedge: { make: std({ color: '#5E8A4E', map: foliage, normalMap: foliageNormal, roughness: 0.95 }) },
      flower: { make: std({ color: '#D65B96', map: foliage, normalMap: foliageNormal, roughness: 0.85 }) },
      potWhite: { make: std({ color: '#E9E4DC', roughness: 0.5 }) },
      potDark: { make: std({ color: '#3C3B39', roughness: 0.55 }) },
      water: {
        make: phys({
          color: '#46B3C2',
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity: 0.88,
          normalMap: this.waterNormal,
          normalScale: new THREE.Vector2(0.35, 0.35),
          envMapIntensity: 1.3,
          emissive: '#1A8A99',
        }),
        glow: 'pool',
        base: 0.55,
      },
      poolTile: { make: std({ color: '#7FC9CF', roughness: 0.35, emissive: '#1C6F7A' }), glow: 'pool', base: 0.4 },
      // Interior.
      marble: { make: phys({ color: '#FFFFFF', map: marble, roughness: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.1 }) },
      marbleDark: { make: phys({ color: '#FFFFFF', map: marbleDark, roughness: 0.18, clearcoat: 0.5 }) },
      wall: { make: std({ color: '#EDE7DE', roughness: 0.92 }) },
      ceiling: { make: std({ color: '#F4F1EC', roughness: 0.95 }) },
      boucle: { make: std({ color: '#FFFFFF', map: boucle, roughness: 0.98 }) },
      linen: { make: std({ color: '#FFFFFF', map: linen, roughness: 0.96 }) },
      duvet: { make: std({ color: '#F7F3EC', map: boucle, roughness: 1 }) },
      sage: { make: std({ color: '#FFFFFF', map: sage, roughness: 0.96 }) },
      terracotta: { make: std({ color: '#FFFFFF', map: terracotta, roughness: 0.96 }) },
      leather: { make: std({ color: '#8A5433', roughness: 0.55 }) },
      black: { make: std({ color: '#141414', roughness: 0.25, metalness: 0.2 }) },
      ceramic: { make: phys({ color: '#F7F5F1', roughness: 0.12, clearcoat: 1 }) },
      curtain: {
        make: std({ color: '#F4EEE3', roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, emissive: '#FFE7C4' }),
        glow: 'interior',
        base: 0.08,
      },
      lampShade: { make: std({ color: '#F6E7CF', emissive: '#FFD39A', roughness: 0.9 }), glow: 'lamp', base: 2.2 },
      bulb: { make: light(3.4, 2.5, 1.6), glow: 'lamp', base: 1 },
      fire: { make: light(3.2, 1.3, 0.4), glow: 'lamp', base: 1 },
      screen: { make: std({ color: '#0B0C0D', roughness: 0.08, metalness: 0.3 }) },
      mirror: { make: std({ color: '#E8ECEE', roughness: 0.04, metalness: 1, envMapIntensity: 3.2 }) },
      rug: { make: std({ color: '#D8CDBB', map: linen, roughness: 1 }) },
      rugDark: { make: std({ color: '#8C7A66', map: linen, roughness: 1 }) },
      // Penthouse finishes, after the ph-* renders: warm polished marble, olive velvet, smoked glass.
      marbleFloor: {
        make: phys({ color: '#F1E6D6', map: marble, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.25 }),
      },
      olive: { make: phys({ color: '#FFFFFF', map: olive, roughness: 0.82, sheen: 1, sheenColor: '#C8CE96', sheenRoughness: 0.45 }) },
      taupe: { make: phys({ color: '#FFFFFF', map: taupe, roughness: 0.9, sheen: 0.6, sheenColor: '#E6D6C2', sheenRoughness: 0.6 }) },
      bronze: { make: std({ color: '#6B5236', roughness: 0.32, metalness: 1 }) },
      smoked: {
        make: phys({ color: '#3B332C', roughness: 0.05, transparent: true, opacity: 0.42, envMapIntensity: 1.4, depthWrite: false }),
      },
      globe: {
        make: phys({ color: '#F4E3C4', roughness: 0.05, transparent: true, opacity: 0.35, emissive: '#FFCB8A', depthWrite: false }),
        glow: 'lamp',
        base: 0.35,
      },
      bottle: { make: phys({ color: '#2E1B14', roughness: 0.08, clearcoat: 1 }) },
      paint: { make: phys({ color: '#1C1F22', roughness: 0.25, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 }) },
      paintWhite: { make: phys({ color: '#E9EAEC', roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 }) },
      tyre: { make: std({ color: '#151515', roughness: 0.9 }) },
      tail: { make: light(4, 0.25, 0.2), glow: 'lamp', base: 1 },
      grass: { make: std({ color: '#FFFFFF', roughness: 1 }) },
      asphalt: { make: std({ color: '#FFFFFF', roughness: 0.4 }) },
    };
    for (const [k, v] of Object.entries(defs)) this.defs.set(k, v);
  }

  /** Shared material (landscape, interior). */
  get(key: string): THREE.Material {
    let m = this.cache.get(key);
    if (m) return m;
    m = this.create(key);
    this.cache.set(key, m);
    return m;
  }

  /** A clone owned by one building level so it can fade independently. */
  forLevel(key: string, level: number): THREE.Material {
    const k = `${key}@${level}`;
    let m = this.cache.get(k);
    if (m) return m;
    m = this.create(key);
    m.userData.baseOpacity = m.opacity;
    m.userData.baseTransparent = m.transparent;
    m.userData.baseDepthWrite = m.depthWrite;
    this.cache.set(k, m);
    const list = this.byLevel.get(level) ?? [];
    list.push(m);
    this.byLevel.set(level, list);
    return m;
  }

  private create(key: string) {
    const def = this.defs.get(key);
    if (!def) throw new Error(`Unknown material ${key}`);
    const m = def.make();
    if (def.glow) {
      const color = m instanceof THREE.MeshBasicMaterial ? m.color.clone() : undefined;
      this.glowing.push({ m, glow: def.glow, base: def.base ?? 1, color });
    }
    return m;
  }

  /** Register a material made elsewhere (textures on landscape planes) for disposal. */
  own(m: THREE.Material, t?: THREE.Texture) {
    this.cache.set(`own:${this.cache.size}`, m);
    if (t) this.textures.push(t);
    return m;
  }

  setLevelOpacity(level: number, o: number) {
    for (const m of this.byLevel.get(level) ?? []) {
      const base = m.userData.baseOpacity as number;
      const fading = o < 0.999;
      const transparent = fading || (m.userData.baseTransparent as boolean);
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = base * o;
      m.depthWrite = fading ? o > 0.7 && (m.userData.baseDepthWrite as boolean) : (m.userData.baseDepthWrite as boolean);
    }
  }

  /** Levels: 0 = off, 1 = the preset's reference brightness. */
  setGlow(levels: Record<Glow, number>) {
    for (const g of this.glowing) {
      const v = levels[g.glow] * g.base;
      if (g.m instanceof THREE.MeshBasicMaterial) {
        if (g.color) g.m.color.copy(g.color).multiplyScalar(v);
        if (g.m.blending === THREE.AdditiveBlending) g.m.opacity = Math.min(1, v);
      } else if ('emissiveIntensity' in g.m) {
        (g.m as THREE.MeshStandardMaterial).emissiveIntensity = v;
      }
    }
  }

  setFinish(finish: 'oak' | 'walnut') {
    const floor = this.cache.get('floorWood') as THREE.MeshStandardMaterial | undefined;
    if (floor) {
      floor.map = this.wood[finish];
      floor.needsUpdate = true;
    }
  }

  /** The residence floor, whose timber the visitor can switch. */
  floorWood() {
    let m = this.cache.get('floorWood');
    if (!m) {
      const t = this.wood.oak.clone();
      t.repeat.set(0.45, 0.45);
      t.needsUpdate = true;
      const w = this.wood.walnut.clone();
      w.repeat.set(0.45, 0.45);
      w.needsUpdate = true;
      this.textures.push(t, w);
      this.wood = { oak: t, walnut: w };
      m = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: t, roughness: 0.42, envMapIntensity: 0.9 });
      this.cache.set('floorWood', m);
    }
    return m;
  }

  tick(t: number) {
    this.waterNormal.offset.set(t * 0.012, t * 0.008);
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
