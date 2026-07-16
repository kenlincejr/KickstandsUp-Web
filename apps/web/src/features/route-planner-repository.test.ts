import { describe, expect, it } from 'vitest';
import { decodePolyline, isCompleteDefinition, type RouteDefinition } from './route-planner-repository';

const definition: RouteDefinition = {
  title: 'Hill Country loop', avoidHighways: false, avoidTolls: true, avoidFerries: false,
  waypoints: [
    { kind: 'origin', displayName: 'Start', latitude: 30.2, longitude: -97.8, source: 'google_place', coordinateProvenance: 'google_places' },
    { kind: 'destination', displayName: 'Finish', latitude: 30.4, longitude: -98, source: 'google_place', coordinateProvenance: 'google_places' },
  ],
};

describe('route planner contract', () => {
  it('requires resolved endpoints', () => {
    expect(isCompleteDefinition(definition)).toBe(true);
    expect(isCompleteDefinition({ ...definition, waypoints: [{ ...definition.waypoints[0], displayName: '' }, definition.waypoints[1]] })).toBe(false);
  });

  it('decodes a Google encoded polyline', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
});
