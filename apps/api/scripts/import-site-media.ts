/**
 * One-time migration (§52): the renders and films the public site shipped as
 * static files become records in the admin media library, attached to the
 * amenity, residence type, gallery, placement, walkthrough station or film they
 * show — so from now on the admin replaces them, not a developer.
 *
 *   pnpm media:import
 *
 * Idempotent in two halves:
 *   - files: a manifest in the storage directory remembers what was imported,
 *     and a file whose record still exists is skipped;
 *   - links: a placement, station or film is only filled while it is empty, so
 *     a choice made in the admin is never overwritten by a re-run.
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@avida/db';
import { StorageService } from '../src/common/storage.service.js';
import { slotDefaults, siteTours } from '../../../packages/db/prisma/site-seed.js';

const ROOT = resolve(__dirname, '../../..');
const WEB_PUBLIC = resolve(ROOT, 'apps/web/public');

interface SceneWords {
  title: string;
  alt: string;
  provenance: 'supplied' | 'concept';
  focusX?: number;
  focusY?: number;
  src: string;
  video?: string;
}

type Owner = { amenity?: string; typology?: string };
interface Plan {
  category: string;
  collection?: 'LIBRARY' | 'FLOOR_PLAN';
  owner?: Owner;
  galleries: string[];
  hero?: boolean;
}

/** Where each scene belongs in the library. */
const PLAN: Record<string, Plan> = {
  aerial: { category: 'EXTERIOR', galleries: ['project-exterior', '3d-renders'] },
  street: { category: 'EXTERIOR', galleries: ['project-exterior', '3d-renders'], hero: true },
  arrival: { category: 'EXTERIOR', galleries: ['project-exterior', 'lifestyle'] },
  lobby: { category: 'LOBBY', owner: { amenity: 'lobby' }, galleries: ['amenities'] },
  pool: { category: 'POOL', owner: { amenity: 'swimming-pool' }, galleries: ['amenities', 'lifestyle'] },
  restaurant: { category: 'RESTAURANT', owner: { amenity: 'restaurant' }, galleries: ['amenities'] },
  gym: { category: 'GYM', owner: { amenity: 'gym' }, galleries: ['amenities'] },
  wellness: { category: 'INTERIOR', owner: { amenity: 'sauna' }, galleries: ['amenities'] },
  cowork: { category: 'COWORKING', owner: { amenity: 'co-working' }, galleries: ['amenities'] },
  parking: { category: 'OTHER', owner: { amenity: 'basement-parking' }, galleries: ['amenities'] },
  'living-2br': { category: 'LIVING_ROOM', owner: { typology: 'two-bed' }, galleries: ['luxury-interiors'] },
  'two-kitchen': { category: 'KITCHEN', owner: { typology: 'two-bed' }, galleries: ['luxury-interiors'] },
  'one-living': { category: 'LIVING_ROOM', owner: { typology: 'one-bed' }, galleries: ['luxury-interiors'] },
  'one-bedroom': { category: 'BEDROOM', owner: { typology: 'one-bed' }, galleries: ['luxury-interiors'] },
  'one-kitchen': { category: 'KITCHEN', owner: { typology: 'one-bed' }, galleries: ['luxury-interiors'] },
  'ph-living': { category: 'LIVING_ROOM', owner: { typology: 'penthouse-three' }, galleries: ['luxury-interiors', 'lifestyle'] },
  'ph-kitchen': { category: 'KITCHEN', owner: { typology: 'penthouse-three' }, galleries: ['luxury-interiors'] },
  'ph-bedroom': { category: 'BEDROOM', owner: { typology: 'penthouse-three' }, galleries: ['luxury-interiors'] },
  'ph-bath': { category: 'BATHROOM', owner: { typology: 'penthouse-three' }, galleries: ['luxury-interiors'] },
  'ph-terrace': { category: 'BALCONY', owner: { typology: 'penthouse-three' }, galleries: ['lifestyle'] },
  view: { category: 'EXTERIOR', galleries: ['lifestyle'] },
  'plan-1br': { category: 'RESIDENCE_PLAN', collection: 'FLOOR_PLAN', owner: { typology: 'one-bed' }, galleries: ['architecture'] },
  'plan-2br': { category: 'RESIDENCE_PLAN', collection: 'FLOOR_PLAN', owner: { typology: 'two-bed' }, galleries: ['architecture'] },
  'plan-ph': { category: 'RESIDENCE_PLAN', collection: 'FLOOR_PLAN', owner: { typology: 'penthouse-three' }, galleries: ['architecture'] },
};

const FILM = {
  video: '/media/almasi/video/almasi-film-hd.mp4',
  poster: '/media/almasi/video/almasi-film-poster.jpg',
};

const provenanceOf = (scene: string, w?: SceneWords) =>
  PLAN[scene]?.collection === 'FLOOR_PLAN' ? 'DRAWING' : w?.provenance === 'supplied' ? 'SUPPLIED_RENDER' : 'CONCEPT_RENDER';

async function main() {
  const storage = new StorageService();
  const manifestPath = resolve(storage.root, '.site-import.json');
  const done: Record<string, string> = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const save = () => writeFile(manifestPath, JSON.stringify(done, null, 2));

  const slug = process.env.DEVELOPMENT_SLUG || process.env.NEXT_PUBLIC_DEVELOPMENT_SLUG || 'almasi-residences';
  const dev = await prisma.development.findUniqueOrThrow({ where: { slug } });
  const words = JSON.parse(await readFile(resolve(__dirname, 'site-media.json'), 'utf8')) as Record<string, SceneWords>;

  const amenities = new Map((await prisma.amenity.findMany({ where: { developmentId: dev.id } })).filter((a) => a.slug).map((a) => [a.slug!, a.id]));
  const types = new Map((await prisma.typology.findMany({ where: { developmentId: dev.id } })).map((t) => [t.slug, t.id]));
  const galleries = new Map((await prisma.gallery.findMany({ where: { developmentId: dev.id } })).map((g) => [g.slug, g.id]));

  const exists = async (key: string) => Boolean(done[key]) && (await prisma.media.count({ where: { id: done[key] } })) > 0;

  let imported = 0;
  let skipped = 0;

  // ── 1. Files ────────────────────────────────────────────────────────────
  for (const [scene, plan] of Object.entries(PLAN)) {
    const w = words[scene];
    if (!w) {
      console.warn(`  ! ${scene}: no words in site-media.json`);
      continue;
    }
    const files: { key: string; path: string; mime: string }[] = [{ key: scene, path: resolve(WEB_PUBLIC, `.${w.src}`), mime: 'image/jpeg' }];
    if (w.video) files.push({ key: `${scene}:video`, path: resolve(WEB_PUBLIC, `.${w.video}`), mime: 'video/mp4' });

    for (const f of files) {
      if (await exists(f.key)) {
        skipped++;
        continue;
      }
      if (!existsSync(f.path)) {
        console.warn(`  ! ${f.key}: ${f.path} is missing`);
        continue;
      }
      const stored = await storage.store(await readFile(f.path), f.mime);
      const owner = {
        amenityId: plan.owner?.amenity ? (amenities.get(plan.owner.amenity) ?? null) : null,
        typologyId: plan.owner?.typology ? (types.get(plan.owner.typology) ?? null) : null,
      };
      const hasCover = await prisma.media.count({ where: { developmentId: dev.id, ...owner, unitId: null, floorId: null, roomId: null, isCover: true } });
      const media = await prisma.media.create({
        data: {
          developmentId: dev.id,
          kind: stored.kind,
          collection: plan.collection ?? 'LIBRARY',
          category: plan.category,
          title: w.title,
          altText: w.alt,
          provenance: provenanceOf(scene, w),
          focusX: w.focusX ?? null,
          focusY: w.focusY ?? null,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          variants: stored.variants ?? undefined,
          blurDataUrl: stored.blurDataUrl,
          dominantHex: stored.dominantHex,
          // A film is the moving version of a still; it belongs to the placement, not the owner's gallery.
          isCover: stored.kind === 'IMAGE' && (owner.amenityId !== null || owner.typologyId !== null) && hasCover === 0,
          ...(stored.kind === 'IMAGE' ? owner : {}),
        },
      });
      done[f.key] = media.id;
      imported++;
      console.log(`  + ${f.key} → ${media.id}`);

      if (stored.kind === 'IMAGE') {
        for (const g of plan.galleries) {
          const galleryId = galleries.get(g);
          if (!galleryId) continue;
          const max = await prisma.galleryItem.aggregate({ where: { galleryId }, _max: { sortOrder: true } });
          await prisma.galleryItem.upsert({
            where: { galleryId_mediaId: { galleryId, mediaId: media.id } },
            create: { galleryId, mediaId: media.id, sortOrder: (max._max.sortOrder ?? -1) + 1 },
            update: {},
          });
        }
        if (plan.hero) {
          const current = await prisma.development.findUniqueOrThrow({ where: { id: dev.id }, select: { heroMediaId: true, mainMediaId: true } });
          await prisma.development.update({
            where: { id: dev.id },
            data: { heroMediaId: current.heroMediaId ?? media.id, mainMediaId: current.mainMediaId ?? media.id },
          });
        }
      }
      await save();
    }
  }

  for (const [key, path, mime, title] of [
    ['film', FILM.video, 'video/mp4', 'Almasi, an architectural film'],
    ['film:poster', FILM.poster, 'image/jpeg', 'Almasi film poster'],
  ] as const) {
    if (await exists(key)) {
      skipped++;
      continue;
    }
    const file = resolve(WEB_PUBLIC, `.${path}`);
    if (!existsSync(file)) {
      console.warn(`  ! ${key}: ${file} is missing`);
      continue;
    }
    const stored = await storage.store(await readFile(file), mime);
    const media = await prisma.media.create({
      data: {
        developmentId: dev.id,
        kind: stored.kind,
        collection: 'LIBRARY',
        category: 'RENDERS_3D',
        title,
        altText: key === 'film:poster' ? 'Almasi Residence at dusk, the opening frame of the film.' : null,
        provenance: 'SUPPLIED_RENDER',
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        width: stored.width,
        height: stored.height,
        variants: stored.variants ?? undefined,
        blurDataUrl: stored.blurDataUrl,
        dominantHex: stored.dominantHex,
      },
    });
    done[key] = media.id;
    imported++;
    console.log(`  + ${key} → ${media.id}`);
    await save();
  }

  // ── 2. Words on files imported before provenance existed ───────────────
  if (!done['@provenance']) {
    for (const [scene, w] of Object.entries(words)) {
      const ids = [done[scene], done[`${scene}:video`]].filter(Boolean) as string[];
      await prisma.media.updateMany({
        where: { id: { in: ids }, provenance: 'PHOTOGRAPH' },
        data: { provenance: provenanceOf(scene, w), focusX: w.focusX ?? null, focusY: w.focusY ?? null },
      });
    }
    done['@provenance'] = 'done';
    await save();
  }
  const mediaId = async (key: string | undefined) => (key && (await exists(key)) ? done[key]! : null);

  // ── 3. Placements, filled only while empty ─────────────────────────────
  const slots = { ...slotDefaults, 'film-poster': { image: 'film:poster' } } as Record<string, { image: string; video?: string }>;
  for (const [key, def] of Object.entries(slots)) {
    const imageId = await mediaId(def.image);
    const videoId = await mediaId(def.video ? `${def.video}:video` : undefined);
    const current = await prisma.mediaSlot.findUnique({ where: { developmentId_key: { developmentId: dev.id, key } } });
    if (!current) {
      await prisma.mediaSlot.create({ data: { developmentId: dev.id, key, imageId, videoId } });
      console.log(`  ✓ placement ${key}`);
    } else if (!current.imageId && !current.videoId) {
      await prisma.mediaSlot.update({ where: { id: current.id }, data: { imageId, videoId } });
    }
  }

  // ── 4. Walkthrough stations ────────────────────────────────────────────
  for (const t of siteTours) {
    const tour = await prisma.tour.findUnique({ where: { developmentId_slug: { developmentId: dev.id, slug: t.slug } }, include: { scenes: true } });
    if (!tour) continue;
    for (const st of t.stations) {
      const scene = tour.scenes.find((s) => s.key === st.key);
      if (!scene || scene.imageId) continue;
      await prisma.scene.update({
        where: { id: scene.id },
        data: { imageId: await mediaId(st.media), videoId: await mediaId(`${st.media}:video`) },
      });
    }
  }

  // ── 5. The film ────────────────────────────────────────────────────────
  const film = await prisma.videoAsset.findFirst({ where: { developmentId: dev.id } });
  if (film && !film.mediaId) {
    await prisma.videoAsset.update({ where: { id: film.id }, data: { mediaId: await mediaId('film'), posterMediaId: await mediaId('film:poster') } });
  }

  // Galleries without a chosen cover take their first item.
  for (const id of galleries.values()) {
    const g = await prisma.gallery.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' }, take: 1 } } });
    if (!g.coverMediaId && g.items[0]) await prisma.gallery.update({ where: { id }, data: { coverMediaId: g.items[0].mediaId } });
  }

  console.log(`› media import: ${imported} imported, ${skipped} already present`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
