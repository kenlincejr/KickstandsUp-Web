import { describe, expect, it } from 'vitest';
import { accountCapabilities, canAuthorTripsOnWeb, canUsePremiumPlanner, hasAccountCapability, hasClubCapability, type AccountTier, type CapabilitySnapshot } from './index';

const snapshot: CapabilitySnapshot = {
  schemaVersion: 1,
  contractVersion: 1,
  projectionRevision: 1_000_000_001,
  projectionState: 'ready',
  rolloutState: 'shadow',
  accountTier: 'participant',
  accountCapabilities: ['rides.read_authorized'],
  scopedAccountCapabilities: { 'ride-1': ['rides.manage_owned_existing'] },
  clubCapabilities: [{ clubId: 'club-1', capabilities: ['club.events.read'] }],
  sources: ['participant', 'club_sponsorship'],
  limits: { new_paid_work: false },
  expiresAt: null,
  checkedAt: '2026-07-15T00:00:00.000Z',
  staleAfterSeconds: 900,
};

describe('capability helpers', () => {
  it('keeps account, bounded ride, and club authority separate', () => {
    expect(hasAccountCapability(snapshot, 'rides.read_authorized')).toBe(true);
    expect(hasAccountCapability(snapshot, 'rides.manage_owned_existing')).toBe(false);
    expect(hasAccountCapability(snapshot, 'rides.manage_owned_existing', 'ride-1')).toBe(true);
    expect(hasClubCapability(snapshot, 'club-1', 'club.events.read')).toBe(true);
    expect(canUsePremiumPlanner(snapshot)).toBe(false);
  });

  it('carries every contract-v3 capability the backend projects for the web', () => {
    for (const capability of ['routes.plan.web', 'routes.plan.map_surface', 'routes.elevation', 'conditions.route_forecast'] as const) {
      expect(accountCapabilities).toContain(capability);
    }
    const basic: AccountTier = 'basic';
    expect(basic).toBe('basic');
  });

  it('gates trip authoring on routes.plan.web, never on routes.plan alone', () => {
    // routes.plan is a BASIC capability; create_trip_ride excludes Basic
    // server-side. Gating on routes.plan would walk a Basic rider through the
    // whole trip form and 42501 at the last click.
    expect(canAuthorTripsOnWeb({ ...snapshot, accountTier: 'basic', accountCapabilities: ['routes.plan'] })).toBe(false);
    expect(canAuthorTripsOnWeb({ ...snapshot, accountTier: 'premium', accountCapabilities: ['routes.plan', 'routes.plan.web'] })).toBe(true);
    expect(canAuthorTripsOnWeb({ ...snapshot, projectionState: 'stale', accountTier: 'premium', accountCapabilities: ['routes.plan.web'] })).toBe(false);
    expect(canAuthorTripsOnWeb({ ...snapshot, projectionState: 'unavailable', accountTier: 'unavailable', accountCapabilities: [] })).toBe(false);
  });

  it('requires a fresh server capability before planner authoring', () => {
    expect(canUsePremiumPlanner({ ...snapshot, accountTier: 'premium', accountCapabilities: ['routes.plan'] })).toBe(true);
    expect(canUsePremiumPlanner({ ...snapshot, projectionState: 'stale', accountTier: 'premium', accountCapabilities: ['routes.plan'] })).toBe(false);
    expect(canUsePremiumPlanner({ ...snapshot, projectionState: 'unavailable', accountTier: 'unavailable', accountCapabilities: [] })).toBe(false);
  });
});
