import { describe, expect, it } from 'vitest';
import {
  ATRIUM,
  CORE,
  FOOTPRINT,
  LEVELS,
  PARKING_BAYS,
  PARTS,
  ROOF_PLAN,
  parkingBays,
  planFor,
  unitAnchor,
  unitEnvelope,
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

const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);
const residentialLevels = Object.keys(SCHEDULE).map(Number);

describe('3D building model', () => {
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
          if (rooms[i]!.name === rooms[j]!.name) continue; // one home, several rooms
          expect(overlap(rooms[i]!.rect, rooms[j]!.rect), `${rooms[i]!.name} / ${rooms[j]!.name} on ${level}`).toBeLessThan(0.01);
        }
      }
    }
  });

  it('keeps every residence inside the building footprint and out of the atrium', () => {
    for (const [level, codes] of Object.entries(SCHEDULE)) {
      for (const code of codes) {
        for (const v of unitVolumes(code, Number(level))) {
          expect(inside(v.rect, FOOTPRINT), code).toBe(true);
          expect(overlap(v.rect, ATRIUM), code).toBe(0);
        }
      }
    }
  });

  it('stands every residence on its floor plate', () => {
    for (const [levelKey, codes] of Object.entries(SCHEDULE)) {
      const plate = planFor(Number(levelKey))!.plate;
      for (const code of codes) {
        for (const v of unitVolumes(code, Number(levelKey))) {
          const covered = plate.reduce((sum, p) => sum + overlap(v.rect, p), 0);
          expect(covered / area(v.rect), code).toBeGreaterThan(0.99);
        }
      }
    }
  });

  it('follows the plans: a 28 m by 33.5 m building around a lift core and an atrium', () => {
    expect(FOOTPRINT[2] - FOOTPRINT[0]).toBeCloseTo(27.95, 1);
    expect(FOOTPRINT[3] - FOOTPRINT[1]).toBeCloseTo(33.5, 1);
    expect(LEVELS).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    for (const level of residentialLevels) {
      const plan = planFor(level)!;
      for (const p of plan.plate) expect(inside(p, FOOTPRINT), `plate on ${level}`).toBe(true);
      // The atrium is open above the ground floor; the core stands on every plate.
      if (level > 0) expect(plan.plate.reduce((sum, p) => sum + overlap(p, ATRIUM), 0), `atrium on ${level}`).toBe(0);
      expect(plan.plate.reduce((sum, p) => sum + overlap(p, CORE), 0), `core on ${level}`).toBeCloseTo(area(CORE), 1);
    }
    expect(planFor(-1)).toBeUndefined();
    expect(planFor(5)).toBeUndefined();
    expect(overlap(ROOF_PLAN.skylight, ATRIUM)).toBeCloseTo(area(ATRIUM), 1);
  });

  it('draws every opening inside its own wall, and no two openings on top of each other', () => {
    for (const level of residentialLevels) {
      for (const w of planFor(level)!.walls) {
        expect(w.to, `wall on ${level}`).toBeGreaterThan(w.from);
        let cursor = w.from;
        for (const o of w.openings) {
          expect(o.at - o.width / 2, `opening at ${o.at} on ${level} ${w.side}`).toBeGreaterThanOrEqual(cursor - 0.01);
          expect(o.at + o.width / 2, `opening at ${o.at} on ${level} ${w.side}`).toBeLessThanOrEqual(w.to + 0.01);
          cursor = o.at + o.width / 2;
        }
      }
    }
  });

  it('keeps balconies outside the floor plate and inside the footprint', () => {
    for (const level of residentialLevels) {
      const plan = planFor(level)!;
      for (const b of plan.balconies) {
        expect(inside(b.rect, FOOTPRINT), `balcony on ${level}`).toBe(true);
        expect(plan.plate.reduce((sum, p) => sum + overlap(b.rect, p), 0), `balcony on ${level}`).toBeLessThan(0.01);
      }
    }
  });

  it('carries a residence highlight out to its facade and balconies, never inward', () => {
    for (const [levelKey, codes] of Object.entries(SCHEDULE)) {
      for (const code of codes) {
        for (const v of unitVolumes(code, Number(levelKey))) {
          const e = unitEnvelope(v.level, v.rect);
          expect(inside(v.rect, e), code).toBe(true);
          expect(e[0], code).toBeGreaterThanOrEqual(FOOTPRINT[0] - 0.5);
          expect(e[2], code).toBeLessThanOrEqual(FOOTPRINT[2] + 0.5);
        }
      }
    }
    // A street-facing home reaches the edge of its balcony.
    const [f] = unitVolumes('F2', 2);
    expect(unitEnvelope(2, f!.rect)[3]).toBeGreaterThan(f!.rect[3] + 2);
  });

  it('draws the basement bays the plan shows, and no more', () => {
    expect(PARKING_BAYS).toBe(14);
    expect(parkingBays(28)).toHaveLength(PARKING_BAYS);
    expect(parkingBays(5)).toHaveLength(5);
    expect(parkingBays(-1)).toHaveLength(0);
  });

  it('places a residence whose code the model does not know once the admin chooses its volume', () => {
    expect(unitVolumes('Z9', 2)).toEqual([]);
    expect(unitVolumes('Z9', 2, 'E').length).toBeGreaterThan(0);
    expect(unitVolumes('Z9', 2, 'NOPE')).toEqual([]);
  });

  it('knows nothing about codes that are not in the schedule', () => {
    expect(unitVolumes('H9', 9)).toEqual([]);
    expect(unitAnchor('H9', 9)).toBeNull();
  });
});
