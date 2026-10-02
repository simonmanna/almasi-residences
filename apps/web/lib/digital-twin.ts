/**
 * Data behind the 3D Design page: places, camera shots, and the residence
 * tour scenes with their rooms and colliders. The engine renders whatever is
 * described here — nothing about a residence's sale state lives in this file.
 */

import { FOOTPRINT, unitVolumes } from './building-model';

export type Place = 'exterior' | 'arrival' | 'reception' | 'pool' | 'garden' | 'residence';
export type Environment = 'day' | 'sunset' | 'night';
export type InteriorMode = 'tour' | 'walk' | 'dollhouse';
export type Point = [number, number, number];

export interface Shot {
  position: Readonly<Point>;
  target: Readonly<Point>;
}

export const PLACES: readonly { id: Exclude<Place, 'residence'>; name: string; caption: string; shot: Shot }[] = [
  {
    id: 'exterior',
    name: 'The building',
    caption: 'Residences above Kimihurura.',
    shot: { position: [-33, 19, 59], target: [0, 8.5, 2] },
  },
  {
    id: 'arrival',
    name: 'The arrival',
    caption: 'A curved canopy, warm timber and stone.',
    shot: { position: [-9, 1.7, 30], target: [-1.1, 4.5, 17] },
  },
  {
    id: 'reception',
    name: 'Reception',
    caption: 'A lobby lit like a hotel at dusk.',
    shot: { position: [-3.3, 1.65, 12.4], target: [0.6, 1.4, 8.6] },
  },
  {
    id: 'pool',
    name: 'The pool',
    caption: 'A lap pool that slips beneath the building.',
    shot: { position: [-19.5, 6.5, 27], target: [-12.5, 1, 11] },
  },
  {
    id: 'garden',
    name: 'The gardens',
    caption: 'Palms and planting along the street front.',
    shot: { position: [-22, 2.4, 27.5], target: [-6, 3.5, 18] },
  },
];

export const placeById = (id: Exclude<Place, 'residence'>) => PLACES.find((p) => p.id === id)!;

/** Exterior hotspots: gold rings the visitor can click to travel. */
export const EXTERIOR_HOTSPOTS: readonly { id: Exclude<Place, 'residence' | 'exterior'>; label: string; position: Point }[] = [
  { id: 'arrival', label: 'Arrival', position: [-1.1, 4.6, 19.9] },
  { id: 'reception', label: 'Reception', position: [-1.1, 2.2, 14.7] },
  { id: 'pool', label: 'Pool', position: [-13.4, 1.6, 18] },
  { id: 'garden', label: 'Gardens', position: [8, 2.2, 19.6] },
];

/** The cinematic reel: exterior aerial → arrival → pool → gardens → a slow sunset orbit. */
export const CINEMATIC: readonly (Shot & { caption: string; seconds: number })[] = [
  { position: [-78, 52, 104], target: [0, 8, 0], caption: 'Almasi Residence, Kimihurura, Kigali', seconds: 7 },
  { position: [-24, 3.2, 44], target: [0, 9, 14], caption: 'A facade of glass, stone and walnut', seconds: 7 },
  { position: [-9, 1.7, 30], target: [-1.1, 4.5, 17], caption: 'The arrival', seconds: 6 },
  { position: [-3.3, 1.65, 12.4], target: [0.6, 1.4, 8.6], caption: 'Reception', seconds: 6 },
  { position: [-19.5, 6.5, 27], target: [-12.5, 1, 11], caption: 'The pool', seconds: 7 },
  { position: [-22, 2.4, 27.5], target: [-6, 3.5, 18], caption: 'The gardens', seconds: 7 },
  { position: [40, 22, 56], target: [0, 9, 0], caption: 'Evening, lit from within', seconds: 8 },
];

// ─── Residence tour scenes ───────────────────────────────────────────────
//
// A scene describes one furnished interior in its own frame: metres, x east,
// z south toward the terrace, y up from the finished floor. The engine renders
// and navigates whatever a scene describes. To give a residence its own
// interior, add a scene (optionally with a GLB `model`) and map its typology
// to it in SCENE_BY_TYPOLOGY.

/** [x0, z0, x1, z1] in the scene's plan. */
export type Rect = readonly [number, number, number, number];
export type PlanPoint = readonly [number, number];
export type RoomId = string;

export interface TourRoom {
  id: RoomId;
  name: string;
  detail: string;
  rect: Rect;
  /** Eye position and look-at target of the room's hero view. */
  position: Point;
  target: Point;
  /** Waypoints from the open-plan hub to the room, through its doors. */
  route?: readonly PlanPoint[];
  outdoor?: boolean;
  /** Floor material key; timber (the switchable finish) when absent indoors, paving outdoors. */
  floor?: string;
}

export interface FacadeRun {
  from: PlanPoint;
  to: PlanPoint;
  kind: 'glass' | 'wall' | 'door';
}

export interface TourScene {
  id: string;
  name: string;
  /** One line under the name in the tour. */
  summary: string;
  /** A meshopt-compressed GLB that replaces the procedural interior once a residence has its own model. */
  model?: string;
  /** The building level the interior sits on, and where its frame origin lands in the world plan. */
  level: number;
  offset: PlanPoint;
  /** Turn about the vertical, radians: where the scene's terrace side (+z) faces. 0 is the street. */
  yaw?: number;
  /**
   * `fixed`: the scene sits where `level`/`offset` say. `slot`: it is a typical
   * layout, moved onto each residence's own floor and position in the building.
   */
  placement: 'fixed' | 'slot';
  ceiling: number;
  /** Everything walkable, terraces included. */
  bounds: Rect;
  /** The enclosed, glazed interior. */
  enclosed: Rect;
  rooms: readonly TourRoom[];
  facade: readonly FacadeRun[];
  partitions: readonly Rect[];
  /** Openings in the partitions; they get a head and walnut jambs. */
  doors: readonly Rect[];
  /** Footprints the walker cannot pass through (furniture, the pool). */
  furniture: readonly Rect[];
  /** Where the camera arrives from outside before it glides indoors. */
  entry: Shot & { room: RoomId };
  startRoom: RoomId;
}

const HALL: PlanPoint = [0, -0.4];

export const PENTHOUSE: TourScene = {
  id: 'penthouse',
  name: 'The Penthouse',
  summary: 'Three bedroom suites, a marble great room and a wraparound pool terrace.',
  level: 4,
  // The pool terrace meets the street edge of the building, the sunset terrace its west edge.
  offset: [0, 6.75],
  placement: 'fixed',
  ceiling: 3.1,
  bounds: [-14, -9, 12, 10],
  enclosed: [-10, -9, 12, 6],
  startRoom: 'living',
  entry: { position: [-1.0, 1.7, 9.3], target: [-4, 1.4, 1.5], room: 'terrace' },
  rooms: [
    {
      id: 'living',
      floor: 'marbleFloor',
      name: 'Living room',
      detail: 'Glass on two sides, and Kigali at sunset.',
      rect: [-10, 0.8, -1, 6],
      position: [-1.9, 1.6, 1.3],
      target: [-8.6, 1.1, 5.4],
    },
    {
      id: 'dining',
      floor: 'marbleFloor',
      name: 'Dining',
      detail: 'A walnut table for ten under hand-blown glass.',
      rect: [-10, -3.5, -1, 0.8],
      position: [-1.8, 1.6, 0.1],
      target: [-7, 0.9, -2.2],
    },
    {
      id: 'kitchen',
      floor: 'marbleFloor',
      name: 'Kitchen',
      detail: 'A Calacatta island, walnut joinery and integrated appliances.',
      rect: [-10, -9, -1, -3.5],
      position: [-2.1, 1.6, -3.9],
      target: [-7.2, 1.05, -8],
    },
    {
      id: 'primary',
      name: 'Primary suite',
      detail: 'A king bed facing the view, with its own terrace door.',
      rect: [3.5, 0.4, 12, 6],
      position: [4.45, 1.6, 5.1],
      target: [9.6, 0.8, 1.4],
      route: [HALL, [4.9, -0.4], [4.9, 1.1]],
    },
    {
      id: 'dressing',
      name: 'Dressing room',
      detail: 'Walk-in wardrobes in smoked glass and walnut.',
      rect: [-1, 0.4, 3.5, 2.4],
      position: [3.0, 1.6, 1.45],
      target: [-0.6, 1.2, 1.0],
      route: [HALL, [4.9, -0.4], [4.9, 1.45]],
    },
    {
      id: 'bathroom',
      floor: 'marble',
      name: 'Primary bathroom',
      detail: 'A stone tub at the window, a rain shower, twin basins.',
      rect: [-1, 2.4, 3.5, 6],
      position: [1.65, 1.6, 2.95],
      target: [1.2, 0.8, 5.9],
      route: [HALL, [4.9, -0.4], [4.9, 1.45], [1.65, 1.45]],
    },
    {
      id: 'bedroom',
      name: 'Second bedroom',
      detail: 'A corner room with morning light from two sides.',
      rect: [7.5, -9, 12, -1.2],
      position: [8.65, 1.6, -1.95],
      target: [10.6, 0.7, -6.6],
      route: [HALL, [8.65, -0.4]],
    },
    {
      id: 'bedroom3',
      name: 'Third bedroom',
      detail: 'A quiet room with a desk at the window.',
      rect: [-1, -9, 4.5, -1.2],
      position: [-0.1, 1.6, -2.2],
      target: [3.6, 0.7, -6.6],
      route: [HALL, [1.45, -0.4], [1.45, -2.0]],
    },
    {
      id: 'shower',
      floor: 'marble',
      name: 'Guest bathroom',
      detail: 'Marble, brushed brass and a walk-in shower.',
      rect: [4.5, -5, 7.5, -1.2],
      position: [5.1, 1.6, -1.75],
      target: [7.2, 1.05, -3.9],
      route: [HALL, [5.85, -0.4], [5.85, -1.5]],
    },
    {
      id: 'terrace',
      floor: 'teak',
      name: 'Pool terrace',
      detail: 'A heated infinity pool above the city.',
      rect: [-14, 6, 12, 10],
      position: [-1.6, 1.6, 6.9],
      target: [-8.5, 0.3, 9.4],
      route: [[-3, 4.7], [-3, 6.9]],
      outdoor: true,
    },
    {
      id: 'outdoor',
      floor: 'paving',
      name: 'Sunset terrace',
      detail: 'Dinner outdoors, facing west over the hills.',
      rect: [-14, -9, -10, 6],
      position: [-11.2, 1.6, -1.6],
      target: [-12.4, 0.6, -6.8],
      route: [[-8.6, -3.5], [-10.9, -3.5]],
      outdoor: true,
    },
  ],
  facade: [
    // West: the great room's glass wall, a sliding door onto the sunset terrace.
    { from: [-10, -9], to: [-10, -5], kind: 'glass' },
    { from: [-10, -5], to: [-10, -2], kind: 'door' },
    { from: [-10, -2], to: [-10, 6], kind: 'glass' },
    // South: living, the bath window, the primary suite.
    { from: [-10, 6], to: [-4.6, 6], kind: 'glass' },
    { from: [-4.6, 6], to: [-1.4, 6], kind: 'door' },
    { from: [-1.4, 6], to: [-1, 6], kind: 'glass' },
    { from: [-1, 6], to: [-0.4, 6], kind: 'wall' },
    { from: [-0.4, 6], to: [3.2, 6], kind: 'glass' },
    { from: [3.2, 6], to: [3.5, 6], kind: 'wall' },
    { from: [3.5, 6], to: [6, 6], kind: 'glass' },
    { from: [6, 6], to: [9, 6], kind: 'door' },
    { from: [9, 6], to: [12, 6], kind: 'glass' },
    // East.
    { from: [12, -9], to: [12, -7], kind: 'wall' },
    { from: [12, -7], to: [12, -3], kind: 'glass' },
    { from: [12, -3], to: [12, 1.5], kind: 'wall' },
    { from: [12, 1.5], to: [12, 5.2], kind: 'glass' },
    { from: [12, 5.2], to: [12, 6], kind: 'wall' },
    // North.
    { from: [-10, -9], to: [-0.2, -9], kind: 'wall' },
    { from: [-0.2, -9], to: [3.6, -9], kind: 'glass' },
    { from: [3.6, -9], to: [8.4, -9], kind: 'wall' },
    { from: [8.4, -9], to: [11.2, -9], kind: 'glass' },
    { from: [11.2, -9], to: [12, -9], kind: 'wall' },
  ],
  partitions: [
    [-1.08, -9, -0.92, -1.2],
    [-1.08, 0.4, -0.92, 6],
    [-0.92, -1.28, 1.0, -1.12],
    [1.9, -1.28, 5.4, -1.12],
    [6.3, -1.28, 8.2, -1.12],
    [9.1, -1.28, 12, -1.12],
    [-0.92, 0.32, 4.4, 0.48],
    [5.4, 0.32, 12, 0.48],
    [3.42, 0.48, 3.58, 1.0],
    [3.42, 1.9, 3.58, 6],
    [-0.92, 2.32, 1.2, 2.48],
    [2.1, 2.32, 3.42, 2.48],
    [4.42, -9, 4.58, -1.2],
    [7.42, -9, 7.58, -1.2],
    [4.58, -5.08, 7.42, -4.92],
  ],
  doors: [
    [-1.08, -1.2, -0.92, 0.4],
    [1.0, -1.28, 1.9, -1.12],
    [5.4, -1.28, 6.3, -1.12],
    [8.2, -1.28, 9.1, -1.12],
    [4.4, 0.32, 5.4, 0.48],
    [3.42, 1.0, 3.58, 1.9],
    [1.2, 2.32, 2.1, 2.48],
  ],
  furniture: [
    [-7.95, 1.9, -6.95, 5.25], // sofa
    [-7.95, 4.75, -5.0, 5.8], // chaise
    [-6.05, 2.85, -4.75, 3.95], // coffee table
    [-6.45, 1.1, -3.85, 2.25], // lounge chairs
    [-1.6, 2.1, -0.92, 5.3], // media wall
    [-7.7, -2.65, -3.3, -0.05], // dining
    [-9.92, -8.92, -1.08, -8.25], // kitchen run
    [-7.75, -6.25, -3.25, -4.55], // island and stools
    [2.25, -7.1, 4.42, -4.1], // third bed
    [0.1, -8.92, 2.1, -8.3], // desk
    [4.58, -8.92, 7.42, -5.08], // wardrobes
    [4.58, -4.92, 6.2, -3.7], // guest shower
    [4.58, -3.2, 5.05, -2.7], // guest WC
    [6.9, -4.3, 7.42, -2.4], // guest vanity
    [7.58, -7.0, 9.75, -4.0], // second bed
    [10.4, -8.7, 11.8, -7.6], // reading chair
    [6.25, 0.48, 9.8, 3.35], // king bed and bench
    [3.58, 2.1, 4.05, 5.1], // primary media wall
    [10.1, 3.3, 11.92, 5.5], // primary lounge chairs
    [-0.92, 0.48, 3.42, 1.02], // wardrobes
    [-0.92, 0.48, -0.42, 2.32],
    [-0.42, 1.9, 1.15, 2.32],
    [2.15, 1.9, 3.42, 2.32],
    [-0.92, 2.9, -0.35, 5.35], // vanity
    [0.25, 4.5, 2.45, 5.8], // tub
    [2.28, 2.48, 2.34, 3.6], // shower screen
    [2.95, 5.3, 3.42, 5.92], // WC
    [-9, 7.7, -2, 9.75], // pool
    [0.0, 7.0, 3.7, 9.5], // loungers
    [6.0, 7.2, 11.3, 9.8], // outdoor lounge
    [-13.5, -8.0, -10.5, -4.35], // outdoor dining
    [-13.7, 0.0, -10.7, 3.4], // fire-table lounge
    [-14, 9.2, -9.2, 10], // planters
    [3.8, 9.2, 5.9, 10],
    [-14, -9, -13.25, -0.2],
    [-14, 3.5, -13.25, 10],
  ],
};

/**
 * The typical one-bedroom home, traced from the furnished plan
 * (public/media/almasi/plan-1br.jpg): an open kitchen, dining and living room
 * on the balcony, the bedroom beside it with a wall of wardrobes, and a
 * shower room off the entrance hall.
 */
export const ONE_BEDROOM: TourScene = {
  id: 'one-bedroom',
  name: 'One-bedroom residence',
  summary: 'Open-plan kitchen, dining and living, a bedroom suite and a full-width balcony.',
  level: 1,
  offset: [0, 0],
  placement: 'slot',
  ceiling: 2.9,
  bounds: [-4.6, -4.2, 4.6, 4.6],
  enclosed: [-4.6, -4.2, 4.6, 3.0],
  startRoom: 'living',
  entry: { position: [-2.8, 1.7, 4.2], target: [-2.8, 1.4, 0.5], room: 'balcony' },
  rooms: [
    {
      id: 'living',
      name: 'Living room',
      detail: 'A sofa facing the media wall, glass to the balcony.',
      rect: [-4.6, -0.9, 0.22, 3.0],
      position: [-0.3, 1.6, -0.7],
      target: [-4.2, 1.0, 2.6],
    },
    {
      id: 'kitchen',
      name: 'Kitchen and dining',
      detail: 'A marble island with stools, and a round table at the window.',
      rect: [-4.6, -4.2, 0.3, -0.9],
      position: [-0.1, 1.6, -1.1],
      target: [-2.8, 1.0, -3.8],
    },
    {
      id: 'bedroom',
      name: 'Bedroom',
      detail: 'A queen bed, a wall of wardrobes and its own window.',
      rect: [0.38, -1.22, 4.6, 3.0],
      position: [1.0, 1.6, -0.7],
      target: [4.0, 0.8, 1.8],
      route: [[-0.1, -1.9], [0.9, -1.9], [0.9, -0.8]],
    },
    {
      id: 'bathroom',
      floor: 'marble',
      name: 'Shower room',
      detail: 'Marble, a glass walk-in shower and a floating vanity.',
      rect: [2.03, -4.2, 4.6, -1.38],
      position: [2.5, 1.6, -2.6],
      target: [4.3, 1.0, -3.6],
      route: [[-0.1, -1.9], [1.2, -2.6]],
    },
    {
      id: 'balcony',
      floor: 'paving',
      name: 'Balcony',
      detail: 'Planters and a table for two.',
      rect: [-4.6, 3.0, 4.6, 4.6],
      position: [-0.6, 1.6, 3.8],
      target: [3.6, 0.8, 4.0],
      route: [[-2.8, 2.4], [-2.8, 3.8]],
      outdoor: true,
    },
  ],
  facade: [
    // South, onto the balcony: the living room's glass and slider, then the bedroom window.
    { from: [-4.6, 3.0], to: [-3.6, 3.0], kind: 'glass' },
    { from: [-3.6, 3.0], to: [-2.0, 3.0], kind: 'door' },
    { from: [-2.0, 3.0], to: [0.0, 3.0], kind: 'glass' },
    { from: [0.0, 3.0], to: [1.0, 3.0], kind: 'wall' },
    { from: [1.0, 3.0], to: [3.8, 3.0], kind: 'glass' },
    { from: [3.8, 3.0], to: [4.6, 3.0], kind: 'wall' },
    // West: a window by the dining table.
    { from: [-4.6, -4.2], to: [-4.6, -3.6], kind: 'wall' },
    { from: [-4.6, -3.6], to: [-4.6, -1.2], kind: 'glass' },
    { from: [-4.6, -1.2], to: [-4.6, 3.0], kind: 'wall' },
    // North (the gallery, with the front door) and east.
    { from: [-4.6, -4.2], to: [4.6, -4.2], kind: 'wall' },
    { from: [4.6, -4.2], to: [4.6, 3.0], kind: 'wall' },
  ],
  partitions: [
    [0.22, -1.3, 0.38, 3.0],
    [0.38, -1.38, 0.5, -1.22],
    [1.3, -1.38, 4.6, -1.22],
    [1.87, -4.2, 2.03, -3.0],
    [1.87, -2.2, 2.03, -1.38],
  ],
  doors: [
    [0.5, -1.38, 1.3, -1.22],
    [1.87, -3.0, 2.03, -2.2],
  ],
  furniture: [
    [-2.05, 0.1, -1.05, 2.5], // sofa
    [-3.25, 0.75, -2.45, 1.85], // coffee table
    [-4.6, 0.2, -4.18, 2.4], // media console
    [-3.2, -4.2, 0.3, -3.58], // kitchen run
    [-2.2, -2.95, -0.4, -2.05], // island
    [-2.1, -1.9, -0.5, -1.4], // stools
    [-4.4, -3.15, -2.7, -1.45], // dining
    [1.95, -0.1, 4.6, 2.1], // bed
    [4.0, -0.65, 4.6, 2.65], // nightstands
    [1.5, -1.22, 4.5, -0.6], // wardrobes
    [0.5, 2.0, 1.3, 2.8], // armchair
    [3.4, -4.2, 4.6, -3.0], // shower
    [2.05, -4.2, 3.3, -3.7], // vanity
    [4.05, -2.5, 4.6, -1.9], // WC
    [2.0, 3.3, 3.6, 4.5], // balcony table
    [-4.6, 4.2, -3.2, 4.6], // planters
    [-1.0, 4.2, 1.2, 4.6],
  ],
};

/**
 * The typical two-bedroom home, traced from the furnished plan
 * (public/media/almasi/plan-2br.jpg): a primary suite with a walk-in wardrobe
 * and an ensuite on one side, a second bedroom and bathroom on the other, and
 * between them the kitchen, dining and living room on a full-width terrace.
 */
export const TWO_BEDROOM: TourScene = {
  id: 'two-bedroom',
  name: 'Two-bedroom residence',
  summary: 'A primary suite with walk-in wardrobe, a second bedroom, open-plan living and a full-width terrace.',
  level: 1,
  offset: [0, 0],
  placement: 'slot',
  ceiling: 2.9,
  bounds: [-6.5, -5.0, 6.5, 5.0],
  enclosed: [-6.5, -5.0, 6.5, 3.2],
  startRoom: 'living',
  entry: { position: [-0.4, 1.7, 4.5], target: [-0.4, 1.4, 0.5], room: 'terrace' },
  rooms: [
    {
      id: 'living',
      name: 'Living and dining',
      detail: 'A deep sofa at the media wall, a walnut table for eight.',
      rect: [-2.92, -0.6, 2.92, 3.2],
      position: [0.2, 1.6, 2.6],
      target: [-2.8, 1.0, 0.0],
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      detail: 'A Calacatta island, walnut joinery and integrated appliances.',
      rect: [-2.92, -5.0, 2.92, -0.6],
      position: [-1.8, 1.6, -1.0],
      target: [0.6, 1.0, -4.6],
      route: [[0.2, -1.25]],
    },
    {
      id: 'primary',
      name: 'Primary bedroom',
      detail: 'A king bed, a walk-in wardrobe and its own ensuite.',
      rect: [-6.5, -2.6, -3.08, 3.2],
      position: [-3.6, 1.6, -2.0],
      target: [-5.4, 0.8, 0.8],
      route: [[0.2, -1.25], [-2.4, -1.25], [-2.4, -2.0]],
    },
    {
      id: 'wardrobe',
      name: 'Walk-in wardrobe',
      detail: 'Open walnut shelving and hanging on two walls.',
      rect: [-6.5, -5.0, -4.83, -2.68],
      position: [-5.6, 1.6, -3.0],
      target: [-5.9, 1.2, -4.8],
      route: [[0.2, -1.25], [-2.4, -1.25], [-2.4, -2.0], [-3.6, -2.0], [-5.6, -2.2]],
    },
    {
      id: 'ensuite',
      floor: 'marble',
      name: 'Ensuite',
      detail: 'A walk-in shower, a floating vanity and marble all round.',
      rect: [-4.67, -5.0, -3.08, -2.68],
      position: [-3.9, 1.6, -3.0],
      target: [-3.9, 1.0, -4.8],
      route: [[0.2, -1.25], [-2.4, -1.25], [-2.4, -2.0], [-3.6, -2.0], [-3.9, -2.2]],
    },
    {
      id: 'bedroom',
      name: 'Second bedroom',
      detail: 'A double bed and a window onto the terrace.',
      rect: [3.08, -1.22, 6.5, 3.2],
      position: [3.6, 1.6, -0.6],
      target: [5.8, 0.8, 1.6],
      route: [[0.2, -1.25], [2.5, -1.25], [2.5, -2.0], [3.6, -2.0]],
    },
    {
      id: 'bathroom',
      floor: 'marble',
      name: 'Bathroom',
      detail: 'A glass shower, a stone basin and brushed brass.',
      rect: [4.28, -5.0, 6.5, -1.38],
      position: [4.8, 1.6, -2.0],
      target: [6.2, 1.0, -4.2],
      route: [[0.2, -1.25], [2.5, -1.25], [2.5, -2.0], [3.6, -2.0]],
    },
    {
      id: 'terrace',
      floor: 'paving',
      name: 'Terrace',
      detail: 'Planting along the rail and a table for two.',
      rect: [-6.5, 3.2, 6.5, 5.0],
      position: [2.0, 1.6, 4.2],
      target: [6.0, 0.6, 4.4],
      route: [[-0.4, 2.6], [-0.4, 4.2]],
      outdoor: true,
    },
  ],
  facade: [
    // South, onto the terrace: the primary bedroom, the living room and its slider, the second bedroom.
    { from: [-6.5, 3.2], to: [-6.1, 3.2], kind: 'wall' },
    { from: [-6.1, 3.2], to: [-3.4, 3.2], kind: 'glass' },
    { from: [-3.4, 3.2], to: [-2.6, 3.2], kind: 'wall' },
    { from: [-2.6, 3.2], to: [-1.2, 3.2], kind: 'glass' },
    { from: [-1.2, 3.2], to: [0.4, 3.2], kind: 'door' },
    { from: [0.4, 3.2], to: [2.6, 3.2], kind: 'glass' },
    { from: [2.6, 3.2], to: [3.4, 3.2], kind: 'wall' },
    { from: [3.4, 3.2], to: [6.1, 3.2], kind: 'glass' },
    { from: [6.1, 3.2], to: [6.5, 3.2], kind: 'wall' },
    { from: [-6.5, -5.0], to: [-6.5, 3.2], kind: 'wall' },
    { from: [6.5, -5.0], to: [6.5, 3.2], kind: 'wall' },
    { from: [-6.5, -5.0], to: [6.5, -5.0], kind: 'wall' },
  ],
  partitions: [
    [-3.08, -5.0, -2.92, -2.4],
    [-3.08, -1.6, -2.92, 3.2],
    [-6.5, -2.68, -6.0, -2.52],
    [-5.2, -2.68, -4.3, -2.52],
    [-3.5, -2.68, -3.08, -2.52],
    [-4.83, -5.0, -4.67, -2.68],
    [2.92, -5.0, 3.08, -2.4],
    [2.92, -1.6, 3.08, 3.2],
    [3.08, -1.38, 3.2, -1.22],
    [4.0, -1.38, 6.5, -1.22],
    [4.12, -5.0, 4.28, -2.4],
    [4.12, -1.6, 4.28, -1.38],
  ],
  doors: [
    [-3.08, -2.4, -2.92, -1.6],
    [-6.0, -2.68, -5.2, -2.52],
    [-4.3, -2.68, -3.5, -2.52],
    [2.92, -2.4, 3.08, -1.6],
    [3.2, -1.38, 4.0, -1.22],
    [4.12, -2.4, 4.28, -1.6],
  ],
  furniture: [
    [-1.2, -0.7, -0.2, 1.9], // sofa
    [-2.25, 0.1, -1.45, 1.1], // coffee table
    [-2.92, -0.4, -2.55, 1.6], // media console
    [-2.65, 2.0, -1.75, 2.8], // armchair
    [0.5, -0.9, 2.7, 2.5], // dining
    [-1.2, -3.1, 1.2, -2.1], // island
    [-1.1, -2.0, 1.1, -1.5], // stools
    [-1.6, -5.0, 2.9, -4.36], // kitchen run and fridge
    [-6.5, -0.8, -3.8, 1.6], // king bed
    [-6.5, -1.35, -5.9, 2.15], // nightstands
    [-4.15, 2.2, -3.25, 3.05], // armchair
    [-6.5, -5.0, -5.95, -2.7], // wardrobes
    [-5.95, -5.0, -4.83, -4.45],
    [-4.67, -4.4, -4.15, -3.1], // ensuite vanity
    [-3.95, -5.0, -3.08, -3.9], // ensuite shower
    [-4.6, -5.0, -4.1, -4.45], // ensuite WC
    [3.9, -0.1, 6.5, 2.1], // second bed
    [5.9, -0.65, 6.5, 2.65], // nightstands
    [3.15, 2.2, 4.05, 3.05], // armchair
    [3.08, -5.0, 4.12, -4.4], // linen cupboard
    [6.0, -3.4, 6.5, -2.0], // bathroom vanity
    [5.3, -5.0, 6.5, -3.8], // shower
    [4.5, -5.0, 5.0, -4.45], // WC
    [3.9, 3.5, 5.3, 4.8], // terrace table
    [-6.4, 4.55, -3.4, 5.0], // planters
    [1.0, 4.55, 3.4, 5.0],
    [5.8, 4.3, 6.5, 5.0], // olive
  ],
};

export const TOUR_SCENES: Readonly<Record<string, TourScene>> = {
  penthouse: PENTHOUSE,
  'one-bedroom': ONE_BEDROOM,
  'two-bedroom': TWO_BEDROOM,
};

export interface SceneResidence {
  type: 'one-bedroom' | 'two-bedroom' | 'three-bedroom' | 'penthouse';
  bedrooms: number;
  code: string;
  floorLevel: number;
  modelSlot?: string | null;
}

/** The typical layout for a kind of home: penthouses tour the penthouse, everything else by bedrooms. */
export function baseSceneFor(residence: Pick<SceneResidence, 'type' | 'bedrooms'> | null): TourScene {
  if (!residence || residence.type === 'penthouse') return PENTHOUSE;
  return residence.bedrooms <= 1 ? ONE_BEDROOM : TWO_BEDROOM;
}

/** The side of the building a residence's rooms meet, and the turn that puts a scene's terrace there. */
const FACING_YAW = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 } as const;

/**
 * A typical layout, set on the residence's own floor and turned so its glass
 * and balcony face the way the residence does — so stepping inside from the
 * building lands where the visitor clicked, at the height and outlook of that home.
 */
export function placeScene(base: TourScene, r: Pick<SceneResidence, 'code' | 'floorLevel' | 'modelSlot'>): TourScene {
  if (base.placement === 'fixed') return base;
  const vols = unitVolumes(r.code, r.floorLevel, r.modelSlot).filter((v) => v.level === r.floorLevel);
  if (!vols.length) return { ...base, level: r.floorLevel };
  const u = vols.reduce<[number, number, number, number]>(
    (a, { rect }) => [Math.min(a[0], rect[0]), Math.min(a[1], rect[1]), Math.max(a[2], rect[2]), Math.max(a[3], rect[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const [fx0, fz0, fx1, fz1] = FOOTPRINT;
  const near = 2.6;
  const side = (['S', 'N', 'E', 'W'] as const).find((s) =>
    s === 'S' ? fz1 - u[3] < near : s === 'N' ? u[1] - fz0 < near : s === 'E' ? fx1 - u[2] < near : u[0] - fx0 < near,
  ) ?? 'S';
  const yaw = FACING_YAW[side];
  const cx = (u[0] + u[2]) / 2;
  const cz = (u[1] + u[3]) / 2;
  // The world point the scene's facade line lands on: the middle of the residence's outer edge.
  const edge: PlanPoint = side === 'S' ? [cx, u[3]] : side === 'N' ? [cx, u[1]] : side === 'E' ? [u[2], cz] : [u[0], cz];
  const [ex0, , ex1, ez1] = base.enclosed;
  const lx = (ex0 + ex1) / 2;
  const lz = ez1;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const round = (n: number) => Math.round(n * 100) / 100;
  const offset: PlanPoint = [round(edge[0] - (lx * cos + lz * sin)), round(edge[1] - (-lx * sin + lz * cos))];
  return { ...base, level: r.floorLevel, offset, yaw };
}

/** The interior a residence opens onto, placed in the building. Always a typical layout of its kind. */
export function sceneFor(residence: SceneResidence | null): { scene: TourScene; typical: boolean } {
  const base = baseSceneFor(residence);
  return { scene: residence ? placeScene(base, residence) : base, typical: residence !== null };
}

/** A key that changes whenever the engine must rebuild or move the interior. */
export const sceneKey = (s: TourScene) => `${s.id}@${s.level}:${s.offset[0]},${s.offset[1]}:${(s.yaw ?? 0).toFixed(3)}`;

export const roomById = (scene: TourScene, id: RoomId) => scene.rooms.find((r) => r.id === id) ?? scene.rooms[0]!;

const inRect = (x: number, z: number, [x0, z0, x1, z1]: Rect) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

/** The room a point stands in; halls return null. Indoor rooms win over terraces. */
export function roomAt(scene: TourScene, x: number, z: number): RoomId | null {
  const indoor = scene.rooms.find((r) => !r.outdoor && inRect(x, z, r.rect));
  return (indoor ?? scene.rooms.find((r) => r.outdoor && inRect(x, z, r.rect)))?.id ?? null;
}

const colliderCache = new WeakMap<TourScene, Rect[]>();
/** Partitions, the solid parts of the facade and the furniture, as plan rectangles. */
export function colliders(scene: TourScene): Rect[] {
  let list = colliderCache.get(scene);
  if (list) return list;
  const t = 0.08;
  const runs = scene.facade
    .filter((f) => f.kind !== 'door')
    .map(({ from: [ax, az], to: [bx, bz] }): Rect => [Math.min(ax, bx) - t, Math.min(az, bz) - t, Math.max(ax, bx) + t, Math.max(az, bz) + t]);
  list = [...scene.partitions, ...runs, ...scene.furniture];
  colliderCache.set(scene, list);
  return list;
}

/** Can a visitor of radius 0.22 m stand here? */
export function canWalk(scene: TourScene, x: number, z: number): boolean {
  const [x0, z0, x1, z1] = scene.bounds;
  const r = 0.22;
  if (x < x0 + 0.3 || x > x1 - 0.3 || z < z0 + 0.3 || z > z1 - 0.3) return false;
  return !colliders(scene).some(([a, b, c, d]) => x > a - r && x < c + r && z > b - r && z < d + r);
}

/** Waypoints between two rooms' hero views, sharing any common stretch of their routes. */
export function routeBetween(scene: TourScene, from: RoomId, to: RoomId): PlanPoint[] {
  if (from === to) return [];
  const a = roomById(scene, from).route ?? [];
  const b = roomById(scene, to).route ?? [];
  let k = 0;
  while (k < a.length && k < b.length && a[k]![0] === b[k]![0] && a[k]![1] === b[k]![1]) k++;
  const back = a.slice(k).reverse();
  return [...back, ...b.slice(k)];
}

export interface TwinState {
  place: Place;
  room: RoomId;
  environment: Environment;
  mode: InteriorMode;
  lights: boolean;
  finish: 'oak' | 'walnut';
}

export const INITIAL_TWIN: TwinState = {
  place: 'exterior',
  room: PENTHOUSE.startRoom,
  environment: 'sunset',
  mode: 'tour',
  lights: true,
  finish: 'oak',
};
