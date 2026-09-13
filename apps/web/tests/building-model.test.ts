import { describe, expect, it } from 'vitest';
import {
  FOOTPRINT,
  parkingBays,
  PARTS,
  unitAnchor,
  unitVolumes,
  type Rect,
} from '../lib/building-model';

/** The developer's apartment schedule (packages/db/prisma/seed-data.ts, floorUnitCodes). */
const SCHEDULE: Record<number, string[]> = {
  0: ['A', 'B', 'C', 'D'],
  1: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'],
  2: ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2'],
  3: ['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3'],
  4: ['PH-A', 'PH-B', 'PH-C'],
};

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

const inside = (r: Rect, outer: Rect) => r[0] >= outer[0] && r[1] >= outer[1] && r[2] <= outer[2] && r[3] <= outer[3];

describe('3D massing model', () => {
  it('gives every residence in the schedule a volume and a label anchor', () => {
    for (const [level, codes] of Object.entries(SCHEDULE)) {
      for (const code of codes) {
        expect(unitVolumes(code, Number(level)).length, code).toBeGreaterThan(0);
        expect(unitAnchor(code, Number(level)), code).not.toBeNull();
      }
    }
  });

  it('places no two residences, cores or common rooms in the same space on a floor', () => {
    for (const [levelKey, codes] of Object.entries(SCHEDULE)) {
      const level = Number(levelKey);
      const rooms = [
        ...codes.flatMap((code) =>
          unitVolumes(code, level)
            .filter((v) => v.level === level)
            .map((v) => ({ name: code, rect: v.rect })),
        ),
        ...PARTS.filter((p) => p.level === level && (p.kind === 'amenity' || p.kind === 'core')).map((p) => ({
          name: p.label ?? p.kind,
          rect: p.rect,
        })),
      ];
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          expect(overlap(rooms[i]!.rect, rooms[j]!.rect), `${rooms[i]!.name} / ${rooms[j]!.name} on ${level}`).toBeLessThan(0.01);
        }
      }
    }
  });

  it('keeps every residence inside the building footprint', () => {
    for (const [level, codes] of Object.entries(SCHEDULE)) {
      for (const code of codes) {
        for (const v of unitVolumes(code, Number(level))) expect(inside(v.rect, FOOTPRINT), code).toBe(true);
      }
    }
  });

  it('has one basement bay for each residence', () => {
    const total = Object.values(SCHEDULE).flat().length;
    expect(total).toBe(28);
    expect(parkingBays(total)).toHaveLength(total);
  });

  it('places a residence whose code the model does not know once the admin chooses its volume', () => {
    expect(unitVolumes('Z9', 2)).toEqual([]);
    expect(unitVolumes('Z9', 2, 'E').length).toBe(1);
    expect(unitVolumes('Z9', 2, 'NOPE')).toEqual([]);
  });

  it('knows nothing about codes that are not in the schedule', () => {
    expect(unitVolumes('H9', 9)).toEqual([]);
    expect(unitAnchor('H9', 9)).toBeNull();
  });
});
