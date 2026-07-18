import { describe, expect, it } from 'vitest';
import { firstIncompletePoint, placeExistingRoutePoint, routePointIdentity, scorePlannerDesign, type RoutePointLike } from './route-point-identity';

const points: RoutePointLike[] = [
  { id: 'start', kind: 'origin', displayName: 'Austin', latitude: 30.2, longitude: -97.7 },
  { id: 'w1', kind: 'via', displayName: 'RR 1431', latitude: 30.4, longitude: -98 },
  { id: 'w2', kind: 'via', displayName: '' },
  { id: 'w3', kind: 'stop', displayName: 'Llano', latitude: 30.7, longitude: -98.6 },
  { id: 'finish', kind: 'destination', displayName: 'Fredericksburg', latitude: 30.2, longitude: -98.8 },
];

describe('route point display identity', () => {
  it('keeps W labels tied to itinerary order when an earlier point is empty', () => {
    expect(points.map((_, index) => routePointIdentity(points, index).token)).toEqual(['S', 'W1', 'W2', 'W3', 'F']);
    expect(routePointIdentity(points, 3)).toMatchObject({ token: 'W3', purpose: 'Stop here' });
  });

  it('reranks labels immediately when route points are reordered', () => {
    const reordered = [points[0], points[3], points[1], points[2], points[4]];
    expect(reordered.map((point, index) => `${point.id}:${routePointIdentity(reordered, index).token}`)).toEqual([
      'start:S', 'w3:W1', 'w1:W2', 'w2:W3', 'finish:F',
    ]);
  });

  it('places the selected incomplete point without appending another point', () => {
    const placed = placeExistingRoutePoint(points, 'w2', { displayName: 'Marble Falls', latitude: 30.57, longitude: -98.27 });
    expect(placed).toHaveLength(points.length);
    expect(placed[2]).toMatchObject({ id: 'w2', displayName: 'Marble Falls' });
    expect(firstIncompletePoint(placed)).toBeNull();
  });

  it('makes every Phase 0 acceptance criterion visible in the 100-point score', () => {
    expect(scorePlannerDesign({ stableIdentity: true, targetedPlacement: true, mapListSelection: true, stalePreviewProtection: true, localRecovery: true, keyboardRecovery: true })).toMatchObject({ score: 100, maxScore: 100, passed: true });
  });
});
