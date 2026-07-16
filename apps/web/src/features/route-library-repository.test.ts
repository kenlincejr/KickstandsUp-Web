import { describe, expect, it } from 'vitest';
import { parseRouteLibraryItem } from './route-library-repository';

const valid = {
  routePlanId: 'plan-1', routeRevisionId: 'revision-1', revisionNumber: 2, title: 'Ozark Loop', description: null,
  regionLabel: 'Ozarks', distanceMeters: 160934, durationSeconds: 10800, pointCount: 2,
  updatedAt: '2026-07-16T20:00:00.000Z', isFavorite: true, sourceKind: 'owner', provenance: null,
  waypoints: [
    { kind: 'origin', displayName: 'Start', latitude: 35, longitude: -80 },
    { kind: 'destination', displayName: 'Finish', latitude: 36, longitude: -81 },
  ],
};

describe('route library contract', () => {
  it('parses a hosted route projection', () => {
    expect(parseRouteLibraryItem(valid)).toMatchObject({ title: 'Ozark Loop', isFavorite: true, pointCount: 2 });
  });

  it('rejects malformed identity and coordinates', () => {
    expect(parseRouteLibraryItem({ ...valid, routePlanId: null })).toBeNull();
    expect(parseRouteLibraryItem({ ...valid, waypoints: [{ ...valid.waypoints[0], latitude: '35' }] })?.waypoints).toEqual([]);
  });
});
