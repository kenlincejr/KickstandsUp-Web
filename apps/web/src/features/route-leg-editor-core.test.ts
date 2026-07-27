import { describe, expect, it } from 'vitest';
import {
  blankPoint,
  clearPointLocation,
  createRouteLegDraft,
  definitionFromDraft,
  droppedPinLocation,
  insertIntermediatePoint,
  mapMarkersFor,
  movePointCoordinates,
  previewMessageFor,
  removePointById,
  reorderPointList,
  resolvePointToPlace,
  setIntermediatePointKind,
  swapAdjacentPoint,
  type DraftPoint,
} from './route-leg-editor-core';

function resolved(kind: DraftPoint['kind'], name: string, latitude = 30, longitude = -97): DraftPoint {
  return { id: crypto.randomUUID(), kind, displayName: name, latitude, longitude, source: 'google_place', coordinateProvenance: 'google_places' };
}

describe('route leg editor core', () => {
  it('seeds a fresh draft with an origin and destination and honors overrides', () => {
    const draft = createRouteLegDraft();
    expect(draft.title).toBe('My next ride');
    expect(draft.points.map((point) => point.kind)).toEqual(['origin', 'destination']);
    expect(draft.previewStale).toBe(false);

    const seeded = createRouteLegDraft({ title: 'Day 2', points: [resolved('origin', 'Lampasas'), blankPoint('destination')] });
    expect(seeded.title).toBe('Day 2');
    expect(seeded.points[0].displayName).toBe('Lampasas');
  });

  it('inserts intermediates before the destination', () => {
    const points = [resolved('origin', 'A'), resolved('destination', 'B')];
    const stop = blankPoint('stop');
    const next = insertIntermediatePoint(points, stop);
    expect(next.map((point) => point.kind)).toEqual(['origin', 'stop', 'destination']);
  });

  it('never swaps or reorders the endpoints', () => {
    const points = [resolved('origin', 'A'), resolved('stop', 'B'), resolved('via', 'C'), resolved('destination', 'D')];
    expect(swapAdjacentPoint(points, 0, 1).map((point) => point.displayName)).toEqual(['A', 'B', 'C', 'D']);
    expect(swapAdjacentPoint(points, 1, -1).map((point) => point.displayName)).toEqual(['A', 'B', 'C', 'D']);
    expect(swapAdjacentPoint(points, 1, 1).map((point) => point.displayName)).toEqual(['A', 'C', 'B', 'D']);
    expect(reorderPointList(points, points[0].id, points[2].id).map((point) => point.displayName)).toEqual(['A', 'B', 'C', 'D']);
    expect(reorderPointList(points, points[1].id, points[2].id).map((point) => point.displayName)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('clears a point back to a query and re-resolves it from a place', () => {
    const points = [resolved('origin', 'A'), resolved('destination', 'B')];
    const cleared = clearPointLocation(points, points[0].id, 'Aus');
    expect(cleared[0]).toMatchObject({ displayName: 'Aus', latitude: undefined, source: undefined, coordinateProvenance: undefined });

    const placed = resolvePointToPlace(cleared, points[0].id, { placeId: 'p1', displayName: 'Austin', address: 'Texas', latitude: 30.2, longitude: -97.7 });
    expect(placed[0]).toMatchObject({ displayName: 'Austin — Texas', googlePlaceId: 'p1', source: 'google_place', coordinateProvenance: 'google_places' });
  });

  it('stamps dropped pins and dragged markers as ksu_customer coordinates', () => {
    expect(droppedPinLocation({ latitude: 30.123456, longitude: -97.654321 })).toEqual({
      displayName: '30.12346, -97.65432', latitude: 30.123456, longitude: -97.654321, source: 'manual', coordinateProvenance: 'ksu_customer',
    });
    const points = [resolved('origin', 'A'), resolved('destination', 'B')];
    const moved = movePointCoordinates(points, points[1].id, { latitude: 31, longitude: -98 });
    expect(moved[1]).toMatchObject({ displayName: '31.00000, -98.00000', source: 'manual', coordinateProvenance: 'ksu_customer', googlePlaceId: undefined });
  });

  it('toggles intermediate kind and removes points by id', () => {
    const points = [resolved('origin', 'A'), resolved('stop', 'B'), resolved('destination', 'C')];
    expect(setIntermediatePointKind(points, points[1].id, 'via')[1].kind).toBe('via');
    expect(removePointById(points, points[1].id).map((point) => point.displayName)).toEqual(['A', 'C']);
  });

  it('builds a definition only when every point is fully resolved', () => {
    const complete = { ...createRouteLegDraft(), points: [resolved('origin', 'A'), resolved('destination', 'B')], title: '  ' };
    const definition = definitionFromDraft(complete, null);
    expect(definition?.title).toBe('Untitled route');
    expect(definition?.waypoints.every((waypoint) => !('id' in waypoint))).toBe(true);
    expect(definitionFromDraft({ ...complete, points: [blankPoint('origin'), resolved('destination', 'B')] }, null)).toBeNull();

    const fuelPlan = { rangeMiles: 150, reservePercent: 20, source: 'manual' as const, plannerVersion: 1 as const };
    expect(definitionFromDraft(complete, fuelPlan)?.fuelPlan).toEqual(fuelPlan);
  });

  it('keeps the preview guidance copy verbatim', () => {
    expect(previewMessageFor({ previewReady: true, previewStale: false, firstIncomplete: null })).toBe('Every point is set. Preview the actual roads, then check conditions.');
    expect(previewMessageFor({ previewReady: true, previewStale: true, firstIncomplete: null })).toBe('Route changed after preview. Preview the updated route before conditions or handoff.');
    expect(previewMessageFor({ previewReady: false, previewStale: false, firstIncomplete: { identity: { token: 'W1', name: 'W1', purpose: 'Stop here' } } })).toBe('W1 needs a location. Search for it or place that exact point on the map.');
    expect(previewMessageFor({ previewReady: false, previewStale: false, firstIncomplete: null })).toBe('Add a start and finish to begin.');
  });

  it('maps only located points to markers and flags the selected one', () => {
    const located = resolved('origin', 'A');
    const unlocated = blankPoint('destination');
    const markers = mapMarkersFor([located, unlocated], located.id);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ token: 'S', selected: true });
  });
});
