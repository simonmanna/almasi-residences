import { describe, expect, it } from 'vitest';
import {
  CINEMATIC,
  EXTERIOR_HOTSPOTS,
  INITIAL_TWIN,
  PENTHOUSE,
  PLACES,
  canWalk,
  roomAt,
  routeBetween,
  sceneFor,
} from '../lib/digital-twin';

const S = PENTHOUSE;

describe('3D design data', () => {
  it('starts every room camera where a visitor can stand, inside that room', () => {
    for (const room of S.rooms) {
      expect(canWalk(S, room.position[0], room.position[2]), room.id).toBe(true);
      expect(roomAt(S, room.position[0], room.position[2]), room.id).toBe(room.id);
    }
  });

  it('routes every room through walkable doors', () => {
    for (const room of S.rooms) {
      for (const [x, z] of room.route ?? []) expect(canWalk(S, x, z), `${room.id} ${x},${z}`).toBe(true);
    }
    expect(canWalk(S, S.entry.position[0], S.entry.position[2])).toBe(true);
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

  it('previews the penthouse for every residence until one has its own scene', () => {
    expect(sceneFor({ typologySlug: 'one-bedroom' })).toEqual({ scene: PENTHOUSE, demo: true });
    expect(sceneFor(null).scene).toBe(PENTHOUSE);
  });

  it('gives every exterior hotspot a destination with a camera shot', () => {
    for (const h of EXTERIOR_HOTSPOTS) expect(PLACES.some((p) => p.id === h.id), h.id).toBe(true);
    expect(CINEMATIC.length).toBeGreaterThan(3);
  });

  it('opens at sunset, outside, with the lights on', () => {
    expect(INITIAL_TWIN).toMatchObject({ place: 'exterior', environment: 'sunset', lights: true });
  });
});
