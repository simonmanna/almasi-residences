import type { SceneId } from './media-manifest';

export interface Station {
  id: string;
  scene: SceneId;
  title: string;
  /** Where in the building — the tour's level gauge. */
  place: string;
  text: string;
}

/** The building, entrance to view, in the order a resident would walk it. */
export const BUILDING_TOUR: Station[] = [
  {
    id: 'exterior',
    scene: 'street',
    title: 'Almasi Residences',
    place: 'KG 15 Ave, Kimihurura',
    text: 'Stone, walnut and deep glass balconies behind a gatehouse and a walled garden.',
  },
  {
    id: 'entrance',
    scene: 'arrival',
    title: 'The entrance',
    place: 'Ground floor',
    text: 'A covered drop-off under a walnut canopy, a water wall, and the lobby a few steps from the car.',
  },
  {
    id: 'lobby',
    scene: 'lobby',
    title: 'Reception',
    place: 'Ground floor',
    text: 'Double height, in travertine and walnut, with a lounge for guests and a staffed front desk.',
  },
  {
    id: 'pool',
    scene: 'pool',
    title: 'The pool',
    place: 'Level 1, amenity deck',
    text: 'Fifteen metres, lit after dark, with loungers and planting along the deck.',
  },
  {
    id: 'restaurant',
    scene: 'restaurant',
    title: 'The restaurant',
    place: 'Ground floor',
    text: 'For residents and their guests, opening onto the garden terrace.',
  },
  {
    id: 'gym',
    scene: 'gym',
    title: 'Fitness',
    place: 'Amenity deck',
    text: 'Strength and cardio equipment facing full-height glass and the hills.',
  },
  {
    id: 'wellness',
    scene: 'wellness',
    title: 'Sauna and massage',
    place: 'Amenity deck',
    text: 'A cedar sauna and a quiet treatment room, bookable through reception.',
  },
  {
    id: 'cowork',
    scene: 'cowork',
    title: 'Co-working',
    place: 'Ground floor',
    text: 'About sixty square metres of shared desks and quiet corners, with a call booth.',
  },
  {
    id: 'apartment',
    scene: 'one-living',
    title: 'A residence',
    place: 'Level 2',
    text: 'Through the door of a residence: living, dining and kitchen in one room, turned to the view.',
  },
  {
    id: 'living',
    scene: 'living-2br',
    title: 'The living room',
    place: 'Two bedroom, level 2',
    text: 'Floor-to-ceiling glass slides open onto the balcony and the evening light.',
  },
  {
    id: 'kitchen',
    scene: 'two-kitchen',
    title: 'The kitchen',
    place: 'Two bedroom, level 2',
    text: 'Fitted in walnut and stone, with an island for everyday meals.',
  },
  {
    id: 'bedroom',
    scene: 'one-bedroom',
    title: 'The main bedroom',
    place: 'Two bedroom, level 2',
    text: 'A slatted walnut wall behind the bed, and the hills through the window.',
  },
  {
    id: 'bathroom',
    scene: 'ph-bath',
    title: 'The bathroom',
    place: 'Two bedroom, level 2',
    text: 'Marble, a walk-in shower and warm light — the en-suite to the main bedroom.',
  },
  {
    id: 'balcony',
    scene: 'view',
    title: 'The balcony',
    place: 'Level 2',
    text: 'The room outside: west over the rooftops as the sun goes down.',
  },
  {
    id: 'kigali',
    scene: 'aerial',
    title: 'Kigali',
    place: 'Kimihurura, above the city',
    text: 'The city’s greenest ridge at dusk, with Almasi on its quiet rise.',
  },
];

/** The top floor, room by room. */
export const PENTHOUSE_TOUR: Station[] = [
  {
    id: 'ph-living',
    scene: 'ph-living',
    title: 'The living room',
    place: 'Penthouse level',
    text: 'A walnut ceiling over a room for ten, glazed to the sunset on its long side.',
  },
  {
    id: 'ph-kitchen',
    scene: 'ph-kitchen',
    title: 'The kitchen',
    place: 'Penthouse level',
    text: 'An island kitchen open to the dining table, with the stair to the roof beside it.',
  },
  {
    id: 'ph-bedroom',
    scene: 'ph-bedroom',
    title: 'The master suite',
    place: 'Penthouse level',
    text: 'A lit walk-in closet, a bed facing the view, and the city beyond the glass.',
  },
  {
    id: 'ph-bath',
    scene: 'ph-bath',
    title: 'The en-suite',
    place: 'Penthouse level',
    text: 'A freestanding stone bath in front of the window, and marble on every wall.',
  },
  {
    id: 'ph-terrace',
    scene: 'ph-terrace',
    title: 'The terrace',
    place: 'The roof',
    text: 'A private terrace with an infinity pool, a pergola and a table for evenings outside.',
  },
  {
    id: 'ph-view',
    scene: 'view',
    title: 'The view',
    place: 'The roof',
    text: 'Kigali to the west, as the sun goes down behind the hills.',
  },
];
