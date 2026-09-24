/**
 * Roadmap phase 1 — the presentation the public site used to keep in its own
 * repository, as the first state of database rows the admin now owns:
 * walkthrough stations, film chapters, the specification table, room plan
 * geometry and which library file fills each media slot.
 *
 * `media` values name a scene from the one-time media import
 * (apps/api/scripts/import-site-media.ts); the importer attaches the file. The
 * seed writes words only, and only where nothing exists yet (D-33).
 */
import type { RoomType } from '../generated/client/client.js';

export interface StationSeed {
  key: string;
  media: string;
  title: string;
  place: string;
  body: string;
  /** Homepage story only: where the building gauge points. */
  level?: string;
}

export interface TourSeed {
  slug: string;
  name: string;
  description: string;
  stations: StationSeed[];
}

export const siteTours: TourSeed[] = [
  {
    slug: 'building',
    name: 'The Almasi Residence tour',
    description: 'The building, entrance to view, in the order a resident would walk it.',
    stations: [
      { key: 'exterior', media: 'street', title: 'Almasi Residence', place: 'KG 15 Ave, Kimihurura', body: 'Stone, walnut and deep glass balconies behind a gatehouse and a walled garden.' },
      { key: 'entrance', media: 'arrival', title: 'The entrance', place: 'Ground floor', body: 'A covered drop-off under a walnut canopy, a water wall, and the lobby a few steps from the car.' },
      { key: 'lobby', media: 'lobby', title: 'Reception', place: 'Ground floor', body: 'Double height, in travertine and walnut, with a lounge for guests and a staffed front desk.' },
      { key: 'pool', media: 'pool', title: 'The pool', place: 'Level 1, amenity deck', body: 'Fifteen metres, lit after dark, with loungers and planting along the deck.' },
      { key: 'restaurant', media: 'restaurant', title: 'The restaurant', place: 'Ground floor', body: 'For residents and their guests, opening onto the garden terrace.' },
      { key: 'gym', media: 'gym', title: 'Fitness', place: 'Amenity deck', body: 'Strength and cardio equipment facing full-height glass and the hills.' },
      { key: 'wellness', media: 'wellness', title: 'Sauna and massage', place: 'Amenity deck', body: 'A cedar sauna and a quiet treatment room, bookable through reception.' },
      { key: 'cowork', media: 'cowork', title: 'Co-working', place: 'Ground floor', body: 'About sixty square metres of shared desks and quiet corners, with a call booth.' },
      { key: 'apartment', media: 'one-living', title: 'A residence', place: 'Level 2', body: 'Through the door of a residence: living, dining and kitchen in one room, turned to the view.' },
      { key: 'living', media: 'living-2br', title: 'The living room', place: 'Two bedroom, level 2', body: 'Floor-to-ceiling glass slides open onto the balcony and the evening light.' },
      { key: 'kitchen', media: 'two-kitchen', title: 'The kitchen', place: 'Two bedroom, level 2', body: 'Fitted in walnut and stone, with an island for everyday meals.' },
      { key: 'bedroom', media: 'one-bedroom', title: 'The main bedroom', place: 'Two bedroom, level 2', body: 'A slatted walnut wall behind the bed, and the hills through the window.' },
      { key: 'bathroom', media: 'ph-bath', title: 'The bathroom', place: 'Two bedroom, level 2', body: 'Marble, a walk-in shower and warm light — the en-suite to the main bedroom.' },
      { key: 'balcony', media: 'view', title: 'The balcony', place: 'Level 2', body: 'The room outside: west over the rooftops as the sun goes down.' },
      { key: 'kigali', media: 'aerial', title: 'Kigali', place: 'Kimihurura, above the city', body: 'The city’s greenest ridge at dusk, with Almasi on its quiet rise.' },
    ],
  },
  {
    slug: 'penthouse',
    name: 'The penthouse tour',
    description: 'The top floor, room by room.',
    stations: [
      { key: 'ph-living', media: 'ph-living', title: 'The living room', place: 'Penthouse level', body: 'A walnut ceiling over a room for ten, glazed to the sunset on its long side.' },
      { key: 'ph-kitchen', media: 'ph-kitchen', title: 'The kitchen', place: 'Penthouse level', body: 'An island kitchen open to the dining table, with the stair to the roof beside it.' },
      { key: 'ph-bedroom', media: 'ph-bedroom', title: 'The master suite', place: 'Penthouse level', body: 'A lit walk-in closet, a bed facing the view, and the city beyond the glass.' },
      { key: 'ph-bath', media: 'ph-bath', title: 'The en-suite', place: 'Penthouse level', body: 'A freestanding stone bath in front of the window, and marble on every wall.' },
      { key: 'ph-terrace', media: 'ph-terrace', title: 'The terrace', place: 'The roof', body: 'A private terrace with an infinity pool, a pergola and a table for evenings outside.' },
      { key: 'ph-view', media: 'view', title: 'The view', place: 'The roof', body: 'Kigali to the west, as the sun goes down behind the hills.' },
    ],
  },
  {
    slug: 'experience',
    name: 'The experience',
    description: 'The homepage story: one continuous passage from the air to the roof.',
    stations: [
      { key: 'air', media: 'aerial', level: 'sky', place: 'Kimihurura, from the air', title: 'A quiet rise above the city', body: 'One of Kigali’s greenest ridges, minutes from the Convention Centre and the city centre.' },
      { key: 'street', media: 'street', level: 'street', place: 'KG 15 Ave', title: 'Arrive', body: 'A stone gatehouse and a walled garden. The building stands back behind palms, lit from within.' },
      { key: 'arrival', media: 'arrival', level: 'G', place: 'Ground floor', title: 'The porte-cochère', body: 'A covered drop-off under walnut, a water wall, and the lobby doors a few steps from the car.' },
      { key: 'lobby', media: 'lobby', level: 'G', place: 'Ground floor', title: 'Reception', body: 'Double height, travertine and walnut, and a front desk staffed from morning until late.' },
      { key: 'pool', media: 'pool', level: '1', place: 'Level 1, the amenity deck', title: 'The pool deck', body: 'A fifteen-metre pool, a gym, a sauna and a massage room, one floor above the garden.' },
      { key: 'two-bed', media: 'living-2br', level: '2', place: 'Level 2', title: 'Space to live.', body: 'Two bedrooms from {two-bedroom.areaMin} m², the living room opening onto a balcony and the hills.' },
      { key: 'penthouse', media: 'ph-living', level: '4', place: 'Level 4', title: 'Designed for living.', body: 'The top floor holds {penthouse.countWords} penthouses, from {penthouse.areaMin} to {penthouse.areaMax} m².' },
      { key: 'roof', media: 'ph-terrace', level: 'R', place: 'The roof', title: 'Your view of Kigali.', body: 'A private terrace and pool above the city, turned to the evening light.' },
    ],
  },
];

export const siteFilm = {
  key: 'almasi-film',
  label: 'Almasi, an architectural film',
  description: 'From the air over Kigali to the penthouse roof terrace.',
  durationSec: 49.8,
  chapters: [
    { startSec: 3.4, label: 'Kimihurura', place: 'Above Kigali' },
    { startSec: 7.64, label: 'Almasi Residence', place: 'KG 15 Ave' },
    { startSec: 11.88, label: 'The entrance', place: 'Ground floor' },
    { startSec: 16.13, label: 'Reception', place: 'Ground floor' },
    { startSec: 20.37, label: 'The pool deck', place: 'Level 1' },
    { startSec: 24.61, label: 'A residence', place: 'Level 2' },
    { startSec: 28.85, label: 'Space to live', place: 'Two bedroom' },
    { startSec: 33.09, label: 'The penthouse', place: 'Level 4' },
    { startSec: 34.92, label: 'The master suite', place: 'Level 4' },
    { startSec: 39.16, label: 'Your view of Kigali', place: 'The roof' },
  ],
};

/** The development-wide specification, as the developer's materials state it. */
export const siteSpecifications: { category: string; label: string; value: string }[] = [
  { category: 'Finishes', label: 'Floors', value: 'Tiled throughout.' },
  { category: 'Finishes', label: 'Kitchen', value: 'Fitted, with granite worktops.' },
  { category: 'Finishes', label: 'Storage', value: 'Built-in wardrobes.' },
  { category: 'Finishes', label: 'Bathrooms', value: 'Modern sanitaryware and fittings.' },
  { category: 'Building', label: 'Windows', value: 'Double-glazed.' },
  { category: 'Building', label: 'Power', value: 'A standby generator for common areas, lifts and water pumps, and a dedicated essential circuit in every residence.' },
  { category: 'Building', label: 'Shared', value: 'Swimming pool, gym, sauna and massage room, restaurant, co-working space and a staffed reception.' },
];

/** Which import scene fills each media slot at first. */
export const slotDefaults: Record<string, { image: string; video?: string }> = {
  'home-hero': { image: 'street', video: 'street' },
  'home-film-teaser': { image: 'aerial', video: 'aerial' },
  'home-penthouse': { image: 'ph-terrace', video: 'ph-terrace' },
  'page-amenities': { image: 'pool' },
  'page-location': { image: 'aerial' },
};

export type PlanRect = { x: number; y: number; w: number; h: number; type: RoomType; open?: boolean };

/**
 * Indicative room geometry per residence kind, in plan units. Assigned to a
 * residence's rooms by type and order the first time the seed sees rooms with
 * no position; from then on the admin edits each room's rectangle.
 */
export const planGeometry: Record<'one' | 'two' | 'three' | 'penthouse', PlanRect[]> = {
  one: [
    { x: 20, y: 20, w: 200, h: 130, type: 'KITCHEN' },
    { x: 220, y: 20, w: 120, h: 130, type: 'HALL' },
    { x: 340, y: 20, w: 120, h: 130, type: 'BATHROOM' },
    { x: 460, y: 20, w: 120, h: 130, type: 'STORAGE' },
    { x: 20, y: 150, w: 320, h: 200, type: 'LIVING' },
    { x: 340, y: 150, w: 240, h: 200, type: 'BEDROOM' },
    { x: 20, y: 350, w: 560, h: 60, type: 'BALCONY', open: true },
  ],
  two: [
    { x: 20, y: 20, w: 190, h: 160, type: 'BEDROOM' },
    { x: 210, y: 20, w: 110, h: 160, type: 'BATHROOM' },
    { x: 320, y: 20, w: 200, h: 160, type: 'HALL' },
    { x: 520, y: 20, w: 110, h: 160, type: 'BATHROOM' },
    { x: 630, y: 20, w: 110, h: 160, type: 'STORAGE' },
    { x: 20, y: 180, w: 340, h: 210, type: 'LIVING' },
    { x: 360, y: 180, w: 170, h: 210, type: 'KITCHEN' },
    { x: 530, y: 180, w: 210, h: 210, type: 'BEDROOM' },
    { x: 20, y: 390, w: 720, h: 60, type: 'BALCONY', open: true },
  ],
  three: [
    { x: 20, y: 20, w: 170, h: 160, type: 'BEDROOM' },
    { x: 190, y: 20, w: 170, h: 160, type: 'BEDROOM' },
    { x: 360, y: 20, w: 100, h: 160, type: 'BATHROOM' },
    { x: 460, y: 20, w: 120, h: 160, type: 'HALL' },
    { x: 580, y: 20, w: 110, h: 160, type: 'BATHROOM' },
    { x: 690, y: 20, w: 110, h: 160, type: 'STORAGE' },
    { x: 20, y: 180, w: 360, h: 210, type: 'LIVING' },
    { x: 380, y: 180, w: 180, h: 210, type: 'KITCHEN' },
    { x: 560, y: 180, w: 240, h: 210, type: 'BEDROOM' },
    { x: 20, y: 390, w: 780, h: 60, type: 'BALCONY', open: true },
  ],
  penthouse: [
    { x: 110, y: 20, w: 170, h: 150, type: 'BEDROOM' },
    { x: 280, y: 20, w: 100, h: 150, type: 'BATHROOM' },
    { x: 380, y: 20, w: 150, h: 150, type: 'STUDY' },
    { x: 530, y: 20, w: 110, h: 150, type: 'HALL' },
    { x: 640, y: 20, w: 240, h: 150, type: 'BEDROOM' },
    { x: 110, y: 170, w: 400, h: 250, type: 'LIVING' },
    { x: 510, y: 170, w: 170, h: 250, type: 'KITCHEN' },
    { x: 680, y: 170, w: 200, h: 250, type: 'BEDROOM' },
    { x: 20, y: 20, w: 90, h: 500, type: 'TERRACE', open: true },
    { x: 110, y: 420, w: 770, h: 100, type: 'TERRACE', open: true },
  ],
};
