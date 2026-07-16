import { describe, expect, it } from 'vitest';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import type { RouteWaypoint } from './route-library-repository';

function point(index: number): RouteWaypoint {
  return { kind: index === 0 ? 'origin' : 'stop', displayName: `Point ${index}`, latitude: 35 + index / 100, longitude: -80 - index / 100 };
}

describe('Google Maps handoff', () => {
  it('keeps a portable route in one Maps URL', () => {
    const links = buildGoogleMapsHandoffs(Array.from({ length: 5 }, (_, index) => point(index)));
    expect(links).toHaveLength(1);
    expect(new URL(links[0].url).searchParams.get('waypoints')?.split('|')).toHaveLength(3);
  });

  it('segments longer routes and keeps the boundary point', () => {
    const links = buildGoogleMapsHandoffs(Array.from({ length: 12 }, (_, index) => point(index)));
    expect(links).toHaveLength(3);
    expect(new URL(links[0].url).searchParams.get('destination')).toBe(new URL(links[1].url).searchParams.get('origin'));
  });
});
