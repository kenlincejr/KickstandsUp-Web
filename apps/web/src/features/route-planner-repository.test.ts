import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRouteWeatherRequest, decodePolyline, isCompleteDefinition, type RouteDefinition, type RoutePreview } from './route-planner-repository';

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

  it('builds a bounded Start, Mid-route, Finish request from a fresh preview', () => {
    const preview: RoutePreview = {
      operationId: '3d21b94d-7721-45ce-957a-aaad39901b56', provider: 'google_routes', providerRequestHash: 'a'.repeat(64),
      distanceMeters: 1_000, durationSeconds: 7_201, encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', calculatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), cacheHit: false,
    };
    const request = buildRouteWeatherRequest(preview);

    expect(request.routePreviewFingerprint).toBe(preview.providerRequestHash);
    expect(request.points.map((point) => point.label)).toEqual(['Start', 'Mid-route', 'Finish']);
    expect(request.points.map((point) => point.etaOffsetSeconds)).toEqual([0, 3_601, 7_201]);
    expect(request.points[0]).toMatchObject({ latitude: 38.5, longitude: -120.2 });
    expect(request.points.at(-1)).toMatchObject({ latitude: 43.252, longitude: -126.453 });
  });

  it('requires a fresh preview and never fabricates conditions', () => {
    const repository = readFileSync(resolve(import.meta.dirname, 'route-planner-repository.ts'), 'utf8');
    const planner = readFileSync(resolve(import.meta.dirname, 'route-planner-page.tsx'), 'utf8');
    const weatherProxy = readFileSync(resolve(import.meta.dirname, '../../../../functions/api/route-weather.js'), 'utf8');

    expect(repository).toContain("edgeRequest<RouteWeatherResponse>('route-weather'");
    expect(repository).toContain('Refresh the route preview before checking conditions.');
    expect(planner).toContain('Check route conditions');
    expect(planner).toContain('Stop here = pull over');
    expect(planner).toContain('Ride through = hold the selected road');
    expect(planner).not.toContain('Next map pin');
    expect(planner).toContain('activePlacementPointId');
    expect(planner).toContain('placeExistingRoutePoint');
    expect(planner).toContain('Add a point between Start and Finish');
    expect(planner).toContain('FUEL & CREW BREAKS');
    expect(planner).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(planner).toContain('beginWaypointDrag');
    expect(planner).toContain('routePointIdentity');
    expect(readFileSync(resolve(import.meta.dirname, 'google-route-map.tsx'), 'utf8')).toContain('AdvancedMarkerElement');
    expect(planner).toContain('needs a location');
    expect(planner).toContain("document.addEventListener('pointerdown'");
    expect(planner).toContain('Weather conditions are temporarily unavailable. Your route is still ready.');
    expect(planner).toContain('setWeather(null);');
    expect(planner).toContain('saveRoute(definition, preview, routePlanId)');
    expect(planner).toContain('buildGoogleMapsHandoffs(definition.waypoints)');
    expect(weatherProxy).toContain('/functions/v1/route-weather');
    expect(weatherProxy).toContain("'Cache-Control': 'private, no-store'");
  });
});
