import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStopId, parseStagingLocations, projectStops, type StagingLocation } from './trip-stop-projection';

function stop(overrides: Partial<StagingLocation> = {}): StagingLocation {
  return { displayName: 'Amarillo, TX', address: '', latitude: 35.2, longitude: -101.8, source: 'place_search', kind: 'stop', ...overrides };
}

describe('trip stop projection (port of KickstandsUp stop-projection.ts)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves an existing stopId', () => {
    const input = [stop({ stopId: 'keep-me' })];
    expect(projectStops(input)[0].stopId).toBe('keep-me');
  });

  it('re-mints a duplicate, and the re-mint is unique', () => {
    const projected = projectStops([stop({ stopId: 'dup' }), stop({ displayName: 'Dumas, TX', stopId: 'dup' })]);
    expect(projected[0].stopId).toBe('dup');
    expect(projected[1].stopId).not.toBe('dup');
    expect(projected[1].stopId.length).toBeGreaterThan(0);
  });

  it('preserves object identity for already-valid stops', () => {
    const valid = stop({ stopId: 'stable' });
    const projected = projectStops([valid, stop({ displayName: 'Dumas, TX' })]);
    expect(projected[0]).toBe(valid);
    expect(projected[1]).not.toBe(valid);
  });

  it('detects a duplicate across two different days when run over the flattened trip', () => {
    // The cross-day case is the one the server checks and the one a per-day
    // implementation misses: day 4 duplicated from day 3 carries day 3's ids.
    const dayThree = [stop({ stopId: 'a' }), stop({ displayName: 'Deadwood, SD', stopId: 'b' })];
    const dayFour = dayThree.map((entry) => ({ ...entry }));
    const projected = projectStops([...dayThree, ...dayFour]);
    const ids = projected.map((entry) => entry.stopId);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('a');
    expect(ids[1]).toBe('b');
    expect(ids[2]).not.toBe('a');
    expect(ids[3]).not.toBe('b');
  });

  it('createStopId returns a v4-shaped string when crypto.randomUUID is absent', () => {
    vi.stubGlobal('crypto', {});
    const minted = createStopId();
    expect(minted).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('parses the wire shape like the device: vias stripped of labels/departures/legs', () => {
    const parsed = parseStagingLocations([
      { displayName: 'Palo Duro', kind: 'via', stopLabels: ['scenic'], plannedDepartAt: '2026-08-03T07:00:00-05:00', routedLeg: { fromStopId: '', durationSeconds: 100 } },
      { displayName: 'Buc-ee’s', kind: 'stop', stopLabels: ['gas', 'nonsense'], routedLeg: { fromStopId: '', durationSeconds: 90_000 } },
      { displayName: '   ' },
      { displayName: 'NaN pin', latitude: Number.NaN, longitude: -97 },
    ]);
    expect(parsed).toHaveLength(3);
    expect(parsed![0]).toMatchObject({ kind: 'via', stopLabels: undefined, plannedDepartAt: undefined, routedLeg: undefined });
    expect(parsed![1].stopLabels).toEqual(['gas']);
    // A routedLeg above the 24h ceiling is dropped, not clamped.
    expect(parsed![1].routedLeg).toBeUndefined();
    expect(parsed![2]).toMatchObject({ displayName: 'NaN pin', latitude: undefined, longitude: -97 });
  });

  it('coerces an unknown source to manual and keeps fromStopId "" meaningful', () => {
    const parsed = parseStagingLocations([
      { displayName: 'Start leg', source: 'google_place', routedLeg: { fromStopId: '', durationSeconds: 5400 } },
    ]);
    expect(parsed![0].source).toBe('manual');
    expect(parsed![0].routedLeg).toEqual({ fromStopId: '', durationSeconds: 5400 });
  });
});
