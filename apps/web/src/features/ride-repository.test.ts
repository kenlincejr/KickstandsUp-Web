import { describe, expect, it } from 'vitest';
import { parseAuthorizedRideRoute, parseRiderRide } from './ride-repository';

describe('authorized ride projections', () => {
  it('parses an RLS-visible ride', () => {
    expect(parseRiderRide({ id: 'ride-1', status: 'scheduled', title: 'Saturday Loop', ride_type: 'ride', staging_display_name: 'Fuel Stop', departure_at: null, route_revision_id: null })).toMatchObject({ title: 'Saturday Loop', stagingDisplayName: 'Fuel Stop' });
  });

  it('parses the protected ride route projection', () => {
    expect(parseAuthorizedRideRoute({ routeRevisionId: 'revision-1', revisionNumber: 1, plannedDistanceMeters: 1000, plannedDurationSeconds: 600, waypoints: [{ kind: 'origin', displayName: 'Start', latitude: 35, longitude: -80 }] })).toMatchObject({ routeRevisionId: 'revision-1', distanceMeters: 1000 });
  });
});
