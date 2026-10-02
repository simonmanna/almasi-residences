import { describe, expect, it } from 'vitest';
import {
  CINEMATIC,
  EXTERIOR_HOTSPOTS,
  INITIAL_TWIN,
  ONE_BEDROOM,
  PENTHOUSE,
  PLACES,
  TWO_BEDROOM,
  canWalk,
  roomAt,
  routeBetween,
  sceneFor,
  sceneKey,
} from '../lib/digital-twin';

const S = PENTHOUSE;
const SCENES = [PENTHOUSE, ONE_BEDROOM, TWO_BEDROOM];

describe('3D design data', () => {
  it.each(SCENES.map((s) => [s.id, s] as const))('%s: starts every room camera where a visitor can stand, inside that room', (_, scene) => {
    for (const room of scene.rooms) {
      expect(canWalk(scene, room.position[0], room.position[2]), room.id).toBe(true);
      expect(roomAt(scene, room.position[0], room.position[2]), room.id).toBe(room.id);
    }
  });

  it.each(SCENES.map((s) => [s.id, s] as const))('%s: routes every room through walkable doors', (_, scene) => {
    for (const room of scene.rooms) {
      for (const [x, z] of room.route ?? []) expect(canWalk(scene, x, z), `${room.id} ${x},${z}`).toBe(true);
    }
    expect(canWalk(scene, scene.entry.position[0], scene.entry.position[2])).toBe(true);
    expect(scene.rooms.some((r) => r.id === scene.startRoom)).toBe(true);
  });

  it('blocks walls, furniture, the glazing and the pool, but not the doors', () => {
    expect(canWalk(S, 8, 1.5)).toBe(false); // king bed
    expect(canWalk(S, -5.5, -5.4)).toBe(false); // kitchen island
    expect(canWalk(S, -10, 3)).toBe(false); // west glazing
    expect(canWalk(S, -10, -3.5)).toBe(true); // west sliding door
    expect(canWalk(S, -3, 6)).toBe(true); // south sliding door
    expect(canWalk(S, 1.45, -1.2)).toBe(true); // third-bedroom door
    expect(canWalk(S, 4.9, 0.4)).toBe(true); // primary suite door
    expect(canWalk(S, -5, 8.5)).toBe(false); // pool
    expect(canWalk(S, 0, 20)).toBe(false); // off the terrace
  });

  it('shares corridor stretches instead of doubling back', () => {
    expect(routeBetween(S, 'primary', 'dressing')).toEqual([[4.9, 1.1], [4.9, 1.45]]);
    expect(routeBetween(S, 'bedroom', 'shower')).toEqual([[8.65, -0.4], [5.85, -0.4], [5.85, -1.5]]);
    expect(routeBetween(S, 'living', 'kitchen')).toEqual([]);
  });

  it('opens each residence onto the layout of its kind', () => {
    const r = { code: 'A2', floorLevel: 2, modelSlot: null };
    expect(sceneFor({ ...r, type: 'one-bedroom', bedrooms: 1 }).scene.id).toBe('one-bedroom');
    expect(sceneFor({ ...r, type: 'two-bedroom', bedrooms: 2 }).scene.id).toBe('two-bedroom');
    expect(sceneFor({ ...r, type: 'three-bedroom', bedrooms: 3 }).scene.id).toBe('two-bedroom');
    expect(sceneFor({ code: 'PH-A', floorLevel: 4, modelSlot: null, type: 'penthouse', bedrooms: 3 }).scene).toBe(PENTHOUSE);
    expect(sceneFor(null).scene).toBe(PENTHOUSE);
  });

  it('sets a typical layout on the residence floor, facing the way its home does', () => {
    const west = sceneFor({ code: 'A2', floorLevel: 2, modelSlot: null, type: 'one-bedroom', bedrooms: 1 }).scene;
    expect(west.level).toBe(2);
    expect(west.yaw).toBeCloseTo(-Math.PI / 2);
    const east = sceneFor({ code: 'B3', floorLevel: 3, modelSlot: null, type: 'one-bedroom', bedrooms: 1 }).scene;
    expect(east.yaw).toBeCloseTo(Math.PI / 2);
    const street = sceneFor({ code: 'D1', floorLevel: 1, modelSlot: null, type: 'two-bedroom', bedrooms: 2 }).scene;
    expect(street.yaw).toBe(0);
    const north = sceneFor({ code: 'E1', floorLevel: 1, modelSlot: null, type: 'two-bedroom', bedrooms: 2 }).scene;
    expect(north.yaw).toBeCloseTo(Math.PI);
    // The admin's chosen position wins over the code, and moves the interior with it.
    const moved = sceneFor({ code: 'X9', floorLevel: 1, modelSlot: 'E', type: 'two-bedroom', bedrooms: 2 }).scene;
    expect(sceneKey(moved)).toBe(sceneKey(north));
    expect(sceneKey(west)).not.toBe(sceneKey(east));
  });

  it('gives every exterior hotspot a destination with a camera shot', () => {
    for (const h of EXTERIOR_HOTSPOTS) expect(PLACES.some((p) => p.id === h.id), h.id).toBe(true);
    expect(CINEMATIC.length).toBeGreaterThan(3);
  });

  it('opens at sunset, outside, with the lights on', () => {
    expect(INITIAL_TWIN).toMatchObject({ place: 'exterior', environment: 'sunset', lights: true });
  });
});
