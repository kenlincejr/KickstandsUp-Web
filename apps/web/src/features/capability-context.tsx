import {
  accountCapabilities,
  clubCapabilities,
  type AccountCapability,
  type CapabilitySnapshot,
  type CapabilitySource,
  type ClubCapability,
  type ClubCapabilityScope,
  type ProjectionState,
  type RolloutState,
} from '@ksu/contracts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth/auth-context';

type CapabilityState = {
  loading: boolean;
  snapshot: CapabilitySnapshot;
};

type StoredCapabilityState = CapabilityState & { loadedForUserId: string | null };

const accountCapabilitySet = new Set<string>(accountCapabilities);
const clubCapabilitySet = new Set<string>(clubCapabilities);
const sources = new Set<CapabilitySource>(['participant', 'store_premium', 'ksu_grant', 'club_sponsorship', 'club_role', 'named_seat']);
const safeStaleAccountCapabilities = new Set<AccountCapability>([
  'rides.read_authorized', 'rides.respond_authorized', 'rides.updates.read',
  'routes.read_authorized', 'routes.handoff', 'assistance.request',
  'assistance.offer', 'assistance.read_authorized', 'assistance.preferences',
]);
const safeStaleClubCapabilities = new Set<ClubCapability>(['club.read', 'club.events.read']);

export const unavailableSnapshot = (): CapabilitySnapshot => ({
  schemaVersion: 1,
  contractVersion: 0,
  projectionRevision: 0,
  projectionState: 'unavailable',
  rolloutState: 'disabled',
  accountTier: 'unavailable',
  accountCapabilities: [],
  scopedAccountCapabilities: {},
  clubCapabilities: [],
  sources: [],
  limits: { new_paid_work: false, provider_work_allowed: false },
  expiresAt: null,
  checkedAt: new Date().toISOString(),
  staleAfterSeconds: 900,
});

const CapabilityContext = createContext<CapabilityState | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function filteredArray<T extends string>(value: unknown, allowed: Set<string>): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => typeof item === 'string' && allowed.has(item)) : [];
}

function parseScopedAccountCapabilities(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([scopeId, capabilities]) => [
    scopeId,
    filteredArray<AccountCapability>(capabilities, accountCapabilitySet),
  ]));
}

function parseClubScopes(value: unknown): ClubCapabilityScope[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.club_id !== 'string') return [];
    return [{
      clubId: candidate.club_id,
      capabilities: filteredArray<ClubCapability>(candidate.capabilities, clubCapabilitySet),
    }];
  });
}

function withFailClosedState(snapshot: CapabilitySnapshot): CapabilitySnapshot {
  if (snapshot.projectionState === 'unavailable') return {
    ...snapshot,
    accountTier: 'unavailable',
    accountCapabilities: [],
    scopedAccountCapabilities: {},
    clubCapabilities: [],
    sources: [],
    limits: { ...snapshot.limits, new_paid_work: false, provider_work_allowed: false },
  };
  if (snapshot.projectionState === 'stale') return {
    ...snapshot,
    accountCapabilities: snapshot.accountCapabilities.filter((capability) => safeStaleAccountCapabilities.has(capability)),
    clubCapabilities: snapshot.clubCapabilities.map((scope) => ({
      ...scope,
      capabilities: scope.capabilities.filter((capability) => safeStaleClubCapabilities.has(capability)),
    })),
    limits: { ...snapshot.limits, new_paid_work: false, provider_work_allowed: false },
  };
  return snapshot;
}

export function toStaleSnapshot(snapshot: CapabilitySnapshot): CapabilitySnapshot {
  if (snapshot.projectionState === 'unavailable') return snapshot;
  return withFailClosedState({ ...snapshot, projectionState: 'stale' });
}

export function parseCapabilitySnapshot(value: unknown): CapabilitySnapshot | null {
  if (!isRecord(value)) return null;
  const projectionState = value.projection_state;
  const rolloutState = value.rollout_state;
  const accountTier = value.account_tier;
  const checkedAt = value.checked_at;
  const expiresAt = value.expires_at;
  if (value.schema_version !== 1
    || typeof value.contract_version !== 'number'
    || typeof value.projection_revision !== 'number'
    || !(['ready', 'stale', 'unavailable'] satisfies ProjectionState[]).includes(projectionState as ProjectionState)
    || !(['shadow', 'internal', 'enforcing', 'disabled'] satisfies RolloutState[]).includes(rolloutState as RolloutState)
    || !(['participant', 'premium', 'unavailable'] as const).includes(accountTier as CapabilitySnapshot['accountTier'])
    || typeof checkedAt !== 'string'
    || Number.isNaN(Date.parse(checkedAt))
    || (expiresAt !== null && typeof expiresAt !== 'string')
    || typeof value.stale_after_seconds !== 'number'
    || !isRecord(value.limits)) return null;

  const limits = Object.fromEntries(Object.entries(value.limits).filter((entry): entry is [string, boolean | number | string | null] => {
    const item = entry[1];
    return item === null || ['boolean', 'number', 'string'].includes(typeof item);
  }));
  const snapshot: CapabilitySnapshot = {
    schemaVersion: 1,
    contractVersion: value.contract_version,
    projectionRevision: value.projection_revision,
    projectionState: projectionState as ProjectionState,
    rolloutState: rolloutState as RolloutState,
    accountTier: accountTier as CapabilitySnapshot['accountTier'],
    accountCapabilities: filteredArray<AccountCapability>(value.account_capabilities, accountCapabilitySet),
    scopedAccountCapabilities: parseScopedAccountCapabilities(value.scoped_account_capabilities),
    clubCapabilities: parseClubScopes(value.club_capabilities),
    sources: filteredArray<CapabilitySource>(value.sources, sources),
    limits,
    expiresAt: expiresAt as string | null,
    checkedAt,
    staleAfterSeconds: Math.max(60, Math.min(86400, Math.round(value.stale_after_seconds))),
  };
  return withFailClosedState(snapshot);
}

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<StoredCapabilityState>({
    loading: false,
    snapshot: unavailableSnapshot(),
    loadedForUserId: null,
  });

  useEffect(() => {
    let active = true;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    const client = supabase;

    if (!user || !client) {
      setState({ loading: false, snapshot: unavailableSnapshot(), loadedForUserId: null });
      return () => { active = false; };
    }

    const userId = user.id;
    const markStaleLater = (snapshot: CapabilitySnapshot) => {
      if (staleTimer) clearTimeout(staleTimer);
      const delay = Math.max(0, Date.parse(snapshot.checkedAt) + snapshot.staleAfterSeconds * 1000 - Date.now());
      staleTimer = setTimeout(() => {
        if (!active) return;
        setState((current) => current.loadedForUserId === userId
          ? { ...current, snapshot: toStaleSnapshot(current.snapshot) }
          : current);
      }, Math.min(delay, 2_147_000_000));
    };
    const load = async () => {
      const { data, error } = await client.rpc('my_effective_capabilities_v1');
      if (!active) return;
      const parsed = error ? null : parseCapabilitySnapshot(data);
      if (!parsed) {
        setState((current) => ({
          loading: false,
          loadedForUserId: userId,
          snapshot: current.loadedForUserId === userId ? toStaleSnapshot(current.snapshot) : unavailableSnapshot(),
        }));
        return;
      }
      setState({ loading: false, snapshot: parsed, loadedForUserId: userId });
      markStaleLater(parsed);
    };

    setState({ loading: true, snapshot: unavailableSnapshot(), loadedForUserId: userId });
    void load();
    const channel = client.channel(`capabilities:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'capabilities_invalidated' }, () => { void load(); })
      .subscribe();

    return () => {
      active = false;
      if (staleTimer) clearTimeout(staleTimer);
      void client.removeChannel(channel);
    };
  }, [user?.id]);

  const value = useMemo<CapabilityState>(() => {
    if (!user || state.loadedForUserId !== user.id) return { loading: Boolean(user), snapshot: unavailableSnapshot() };
    return { loading: state.loading, snapshot: state.snapshot };
  }, [state, user]);
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useCapabilities() {
  const context = useContext(CapabilityContext);
  if (!context) throw new Error('useCapabilities must be used within CapabilityProvider.');
  return context;
}
