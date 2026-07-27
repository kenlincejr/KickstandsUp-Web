import { describe, expect, it, vi } from 'vitest';
import { loadCapabilitySnapshot, parseCapabilitySnapshot, toStaleSnapshot, unavailableSnapshot } from './capability-context';

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

  it("parses the live contract's 'basic' tier — the value that used to brick every Basic subscriber", () => {
    // Contract v3 emits account_tier 'basic'. The old union rejected it, the
    // whole snapshot parsed to null, and the caller fell back to
    // unavailableSnapshot(): every Basic subscriber's entire /app surface
    // failed closed in production.
    const snapshot = parseCapabilitySnapshot({ ...readyPremium, account_tier: 'basic', account_capabilities: ['rides.create', 'routes.plan.web', 'routes.elevation', 'conditions.route_forecast'] });
    expect(snapshot?.accountTier).toBe('basic');
    expect(snapshot?.accountCapabilities).toEqual(['rides.create', 'routes.plan.web', 'routes.elevation', 'conditions.route_forecast']);
  });

  it('degrades an UNKNOWN tier to participant instead of failing the snapshot (degrade-low)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshot = parseCapabilitySnapshot({ ...readyPremium, account_tier: 'platinum' });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.accountTier).toBe('participant');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('strips paid work when the projection becomes stale', () => {
    const snapshot = parseCapabilitySnapshot(readyPremium);
    if (!snapshot) throw new Error('Fixture did not parse.');
    const stale = toStaleSnapshot(snapshot);
    expect(stale.projectionState).toBe('stale');
    expect(stale.accountCapabilities).toEqual(['rides.read_authorized']);
    expect(stale.limits.new_paid_work).toBe(false);
  });

  it('strips routes.plan.web on stale — trip AUTHORING pauses, trip reading never does', () => {
    const snapshot = parseCapabilitySnapshot({ ...readyPremium, account_capabilities: ['rides.read_authorized', 'routes.plan', 'routes.plan.web'] });
    if (!snapshot) throw new Error('Fixture did not parse.');
    const stale = toStaleSnapshot(snapshot);
    expect(stale.accountCapabilities).not.toContain('routes.plan.web');
    expect(stale.accountCapabilities).toContain('rides.read_authorized');
  });

  it('fails closed for unavailable or malformed results', () => {
    expect(parseCapabilitySnapshot('premium')).toBeNull();
    expect(parseCapabilitySnapshot({ ...readyPremium, schema_version: 2 })).toBeNull();
    expect(parseCapabilitySnapshot({ ...readyPremium, projection_state: 'unavailable', account_tier: 'premium' })).toMatchObject({
      projectionState: 'unavailable', accountTier: 'unavailable', accountCapabilities: [], sources: [],
    });
    expect(unavailableSnapshot()).toMatchObject({ projectionState: 'unavailable', accountCapabilities: [] });
  });

  it('refreshes an expired browser session and retries the capability RPC once', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301' } })
      .mockResolvedValueOnce({ data: readyPremium, error: null });
    const refreshSession = vi.fn().mockResolvedValue({ error: null });

    await expect(loadCapabilitySnapshot({ rpc, auth: { refreshSession } } as never)).resolves.toMatchObject({
      accountTier: 'premium',
      accountCapabilities: expect.arrayContaining(['routes.plan']),
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('stays fail-closed when refreshing the browser session fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST301' } });
    const refreshSession = vi.fn().mockResolvedValue({ error: { message: 'refresh denied' } });

    await expect(loadCapabilitySnapshot({ rpc, auth: { refreshSession } } as never)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
