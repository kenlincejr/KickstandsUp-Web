import { describe, expect, it } from 'vitest';
import { parseCapabilitySnapshot, toStaleSnapshot, unavailableSnapshot } from './capability-context';

const readyPremium = {
  schema_version: 1,
  contract_version: 1,
  projection_revision: 1_000_000_004,
  projection_state: 'ready',
  rollout_state: 'shadow',
  account_tier: 'premium',
  account_capabilities: ['rides.read_authorized', 'routes.plan', 'forged.capability'],
  scoped_account_capabilities: { 'ride-1': ['rides.manage_owned_existing'] },
  club_capabilities: [{ club_id: 'club-1', capabilities: ['club.read', 'forged.club'] }],
  sources: ['participant', 'ksu_grant'],
  limits: { new_paid_work: true },
  expires_at: null,
  checked_at: '2026-07-15T00:00:00.000Z',
  stale_after_seconds: 900,
};

describe('capability projection parsing', () => {
  it('accepts the versioned server contract and drops unknown capabilities', () => {
    const snapshot = parseCapabilitySnapshot(readyPremium);
    expect(snapshot?.accountTier).toBe('premium');
    expect(snapshot?.accountCapabilities).toEqual(['rides.read_authorized', 'routes.plan']);
    expect(snapshot?.scopedAccountCapabilities['ride-1']).toEqual(['rides.manage_owned_existing']);
    expect(snapshot?.clubCapabilities[0]).toEqual({ clubId: 'club-1', capabilities: ['club.read'] });
  });

  it('strips paid work when the projection becomes stale', () => {
    const snapshot = parseCapabilitySnapshot(readyPremium);
    if (!snapshot) throw new Error('Fixture did not parse.');
    const stale = toStaleSnapshot(snapshot);
    expect(stale.projectionState).toBe('stale');
    expect(stale.accountCapabilities).toEqual(['rides.read_authorized']);
    expect(stale.limits.new_paid_work).toBe(false);
  });

  it('fails closed for unavailable or malformed results', () => {
    expect(parseCapabilitySnapshot('premium')).toBeNull();
    expect(parseCapabilitySnapshot({ ...readyPremium, schema_version: 2 })).toBeNull();
    expect(parseCapabilitySnapshot({ ...readyPremium, projection_state: 'unavailable', account_tier: 'premium' })).toMatchObject({
      projectionState: 'unavailable', accountTier: 'unavailable', accountCapabilities: [], sources: [],
    });
    expect(unavailableSnapshot()).toMatchObject({ projectionState: 'unavailable', accountCapabilities: [] });
  });
});
