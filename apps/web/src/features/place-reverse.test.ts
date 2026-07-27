import { describe, expect, it } from 'vitest';
import { placeReverseLabel } from './place-reverse';

// Captured verbatim from the live discovery worker on 2026-07-27:
//   GET https://discovery.rideksu.com/place-reverse?lat=31.064&lon=-98.181
// An earlier draft of the client parsed `city`/`state`, which do not exist in
// this payload — it produced a bare name and silently dropped the address.
// This fixture is the guard against assuming the shape again.
const LIVE_RESULT = {
  osmId: 'W736963775',
  name: 'Cadence Bank',
  address: '101 East 9th Street, Lampasas, Texas, 76550',
  locality: 'East 9th Street, Lampasas',
  latitude: 31.0601795,
  longitude: -98.1801067,
};

describe('placeReverseLabel', () => {
  it('labels a real worker result as name — address', () => {
    // Matches resolvePointToPlace's format, so a dropped pin and a searched
    // stop read identically in the itinerary.
    expect(placeReverseLabel(LIVE_RESULT)).toBe('Cadence Bank — 101 East 9th Street, Lampasas, Texas, 76550');
  });

  it('falls back through address then locality rather than giving up', () => {
    // A street and a town still beat a coordinate pair.
    expect(placeReverseLabel({ address: '221 East 9th Street, Austin, Texas' })).toBe('221 East 9th Street, Austin, Texas');
    expect(placeReverseLabel({ locality: 'East 9th Street, Austin' })).toBe('East 9th Street, Austin');
    expect(placeReverseLabel({ name: 'Cooper’s BBQ' })).toBe('Cooper’s BBQ');
  });

  it('returns null when there is nothing worth showing', () => {
    expect(placeReverseLabel(undefined)).toBeNull();
    expect(placeReverseLabel({})).toBeNull();
    // Whitespace-only fields are not content — the pin keeps its coordinates.
    expect(placeReverseLabel({ name: '   ', address: '\t', locality: '' })).toBeNull();
  });

  it('ignores non-string fields instead of rendering "[object Object]"', () => {
    expect(placeReverseLabel({ name: 42 as unknown as string, address: 'Lampasas, Texas' })).toBe('Lampasas, Texas');
  });
});
