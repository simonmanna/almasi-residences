/**
 * Data behind the 3D Design page: places, camera shots, and the residence
 * tour scenes with their rooms and colliders. The engine renders whatever is
 * described here — nothing about a residence's sale state lives in this file.
 */

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
    caption: 'Twenty-eight residences above Kimihurura.',
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
  summary: 'Three bedroom suites, a 126 m² great room and a wraparound pool terrace.',
  level: 4,
  // The pool terrace meets the street edge of the building, the sunset terrace its west edge.
  offset: [0, 6.75],
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

export const TOUR_SCENES: Readonly<Record<string, TourScene>> = { penthouse: PENTHOUSE };

/** Typologies with their own interior. Everything else previews the penthouse design. */
export const SCENE_BY_TYPOLOGY: Readonly<Record<string, string>> = {};

/** The interior a residence opens onto, and whether it is its own layout or a design preview. */
export function sceneFor(residence: { typologySlug?: string } | null): { scene: TourScene; demo: boolean } {
  const own = residence?.typologySlug ? SCENE_BY_TYPOLOGY[residence.typologySlug] : undefined;
  const scene = (own && TOUR_SCENES[own]) || PENTHOUSE;
  return { scene, demo: !own };
}

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
