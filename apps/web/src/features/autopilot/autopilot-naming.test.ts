import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_REVERSE_LOOKUPS, pickEvenSubset, resolveInteriorNames } from './autopilot-naming';

describe('pickEvenSubset', () => {
  it('returns everything when under the cap', () => {
    expect(pickEvenSubset([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('caps at max, always keeping the first and last', () => {
    const items = Array.from({ length: 64 }, (_, i) => i);
    const picked = pickEvenSubset(items, MAX_REVERSE_LOOKUPS);
    expect(picked.length).toBeLessThanOrEqual(MAX_REVERSE_LOOKUPS);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(63);
  });

  it('handles max <= 0 and empty input', () => {
    expect(pickEvenSubset([1, 2, 3], 0)).toEqual([]);
    expect(pickEvenSubset([], 10)).toEqual([]);
  });
});

describe('resolveInteriorNames', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves a name on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [{ name: 'Childress' }] }), { status: 200 })));
    const resolved = await resolveInteriorNames([{ pointIndex: 5, latitude: 34.4, longitude: -100.2 }]);
    expect(resolved.get(5)).toEqual({ name: 'Childress', nameSource: 'reverse_geocode', offRouteMeters: 0 });
  });

  it('falls back to null on a 404 (pre-deploy state) without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })));
    const resolved = await resolveInteriorNames([{ pointIndex: 5, latitude: 34.4, longitude: -100.2 }]);
    expect(resolved.get(5)).toEqual({ name: null, nameSource: 'none', offRouteMeters: 0 });
  });

  it('falls back to null on a network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const resolved = await resolveInteriorNames([{ pointIndex: 5, latitude: 34.4, longitude: -100.2 }]);
    expect(resolved.get(5)).toEqual({ name: null, nameSource: 'none', offRouteMeters: 0 });
  });

  it('falls back to null on malformed JSON without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const resolved = await resolveInteriorNames([{ pointIndex: 5, latitude: 34.4, longitude: -100.2 }]);
    expect(resolved.get(5)).toEqual({ name: null, nameSource: 'none', offRouteMeters: 0 });
  });

  it('never issues more than MAX_REVERSE_LOOKUPS requests', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const points = Array.from({ length: 60 }, (_, i) => ({ pointIndex: i, latitude: 30 + i * 0.1, longitude: -97 - i * 0.1 }));
    await resolveInteriorNames(points);
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_REVERSE_LOOKUPS);
  });
});
