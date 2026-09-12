/**
 * One-time migration (§52): the renders the public site shipped as static
 * files become records in the admin media library, attached to the amenity,
 * residence type or gallery they show — so from now on the admin replaces
 * them, not a developer.
 *
 *   pnpm media:import
 *
 * Idempotent: a manifest in the storage directory remembers what was
 * imported, and a file whose record still exists is skipped.
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@avida/db';
import { StorageService } from '../src/common/storage.service.js';

const ROOT = resolve(__dirname, '../../..');
const WEB_PUBLIC = resolve(ROOT, 'apps/web/public');
const DATA = resolve(ROOT, 'apps/web/lib/media-data.json');
const MANIFEST = resolve(ROOT, 'apps/web/lib/media-manifest.ts');

type Owner = { amenity?: string; typology?: string };
interface Plan {
  category: string;
  collection?: 'LIBRARY' | 'FLOOR_PLAN';
  owner?: Owner;
  galleries: string[];
  hero?: boolean;
}

/** Where each scene of the old manifest belongs in the library. */
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

/** Titles and alt text, read from the hand-written words in media-manifest.ts. */
async function words(): Promise<Record<string, { title: string; alt: string; provenance: string }>> {
  const src = await readFile(MANIFEST, 'utf8');
  const out: Record<string, { title: string; alt: string; provenance: string }> = {};
  const re = /['"]?([\w-]+)['"]?:\s*\{\s*title:\s*'((?:[^'\\]|\\.)*)',\s*alt:\s*'((?:[^'\\]|\\.)*)',\s*provenance:\s*'(\w+)'/g;
  for (const m of src.matchAll(re)) out[m[1]!] = { title: m[2]!, alt: m[3]!, provenance: m[4]! };
  return out;
}

async function main() {
  const storage = new StorageService();
  const manifestPath = resolve(storage.root, '.site-import.json');
  const done: Record<string, string> = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

  const slug = process.env.DEVELOPMENT_SLUG || process.env.NEXT_PUBLIC_DEVELOPMENT_SLUG || 'almasi-residences';
  const dev = await prisma.development.findUniqueOrThrow({ where: { slug } });
  const data = JSON.parse(await readFile(DATA, 'utf8')) as Record<string, { src: string; video?: { hd: string } }>;
  const text = await words();

  const amenities = new Map((await prisma.amenity.findMany({ where: { developmentId: dev.id } })).filter((a) => a.slug).map((a) => [a.slug!, a.id]));
  const types = new Map((await prisma.typology.findMany({ where: { developmentId: dev.id } })).map((t) => [t.slug, t.id]));
  const galleries = new Map((await prisma.gallery.findMany({ where: { developmentId: dev.id } })).map((g) => [g.slug, g.id]));

  let imported = 0;
  let skipped = 0;
  for (const [scene, plan] of Object.entries(PLAN)) {
    const entry = data[scene];
    if (!entry) {
      console.warn(`  ! ${scene}: not in media-data.json`);
      continue;
    }
    const files: { key: string; path: string; mime: string }[] = [{ key: scene, path: resolve(WEB_PUBLIC, `.${entry.src}`), mime: 'image/jpeg' }];
    if (entry.video?.hd) files.push({ key: `${scene}:video`, path: resolve(WEB_PUBLIC, `.${entry.video.hd}`), mime: 'video/mp4' });

    for (const f of files) {
      if (done[f.key] && (await prisma.media.count({ where: { id: done[f.key] } }))) {
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
      const words = text[scene];
      const media = await prisma.media.create({
        data: {
          developmentId: dev.id,
          kind: stored.kind,
          collection: plan.collection ?? 'LIBRARY',
          category: plan.category,
          title: words?.title ?? scene,
          altText: words?.alt ?? null,
          caption: words ? (words.provenance === 'supplied' ? 'Artist’s impression' : 'Concept visual. Final interior design by the architect.') : null,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          variants: stored.variants ?? undefined,
          blurDataUrl: stored.blurDataUrl,
          dominantHex: stored.dominantHex,
          isCover: stored.kind === 'IMAGE' && (owner.amenityId !== null || owner.typologyId !== null) && hasCover === 0,
          ...owner,
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
      await writeFile(manifestPath, JSON.stringify(done, null, 2));
    }
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
