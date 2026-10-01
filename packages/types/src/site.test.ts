import { describe, expect, it } from 'vitest';
import { isPlacedInModel, modelSlotsForLevel, resolveModelSlot } from './building.js';
import { fillCopyTokens, MEDIA_SLOTS, provenanceNote, SCOPE_TAGS, SITE_TAGS } from './site.js';

describe('copy tokens', () => {
  it('fills live figures', () => {
    expect(fillCopyTokens('From {penthouse.areaMin} m² across {total} homes.', { 'penthouse.areaMin': 210, total: 28 })).toBe('From 210 m² across 28 homes.');
  });
  it('drops a token with no value instead of printing a brace', () => {
    expect(fillCopyTokens('Handover {handover}.', {})).toBe('Handover.');
  });
});

describe('3D placement', () => {
  it('derives a volume from the code', () => {
    expect(resolveModelSlot('A2', 2)?.key).toBe('A');
    expect(resolveModelSlot('PH-C', 4)?.volumes).toHaveLength(4);
  });
  it('lets the admin place a code the model does not know', () => {
    expect(isPlacedInModel('Z9', 2)).toBe(false);
    expect(isPlacedInModel('Z9', 2, 'e')).toBe(true);
  });
  it('refuses a volume the level does not have', () => {
    expect(isPlacedInModel('A1', 0, 'G')).toBe(false);
    expect(modelSlotsForLevel(-1)).toHaveLength(0);
  });
});

describe('site vocabulary', () => {
  it('prints a note only where the image needs one', () => {
    expect(provenanceNote('PHOTOGRAPH')).toBe('');
    expect(provenanceNote('DRAWING')).not.toBe('');
  });
  it('only names known cache tags', () => {
    const known = new Set(Object.values(SITE_TAGS));
    for (const tags of Object.values(SCOPE_TAGS)) for (const t of tags) expect(known.has(t)).toBe(true);
  });
  it('has unique placement keys', () => {
    expect(new Set(MEDIA_SLOTS.map((s) => s.key)).size).toBe(MEDIA_SLOTS.length);
  });
});
