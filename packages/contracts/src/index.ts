export const accountCapabilities = [
  'rides.read_authorized', 'rides.respond_authorized', 'rides.updates.read',
  'rides.manage_owned_existing', 'routes.read_authorized', 'routes.handoff',
  'rides.discover', 'rides.create', 'rides.chat', 'friends.read',
  'friends.connect', 'friends.status', 'meetups.create', 'meetups.respond',
  'routes.plan', 'routes.save', 'routes.export', 'places.search',
  'conditions.route_brief', 'ai.route_assist', 'assistance.request',
  'assistance.offer', 'assistance.read_authorized', 'assistance.preferences',
] as const;

export const clubCapabilities = [
  'club.read', 'club.events.read', 'club.channel.use', 'club.members.manage',
  'club.roles.manage', 'club.routes.manage', 'club.roadmarks.manage',
  'club.billing.manage',
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];
export type ClubCapability = (typeof clubCapabilities)[number];
export type ProjectionState = 'ready' | 'stale' | 'unavailable';
export type RolloutState = 'shadow' | 'internal' | 'enforcing' | 'disabled';
export type AccountTier = 'participant' | 'premium' | 'unavailable';
export type CapabilitySource = 'participant' | 'store_premium' | 'ksu_grant' | 'club_sponsorship' | 'club_role' | 'named_seat';

export type ClubCapabilityScope = {
  clubId: string;
  capabilities: ReadonlyArray<ClubCapability>;
};

export type CapabilitySnapshot = {
  schemaVersion: 1;
  contractVersion: number;
  projectionRevision: number;
  projectionState: ProjectionState;
  rolloutState: RolloutState;
  accountTier: AccountTier;
  accountCapabilities: ReadonlyArray<AccountCapability>;
  scopedAccountCapabilities: Readonly<Record<string, ReadonlyArray<AccountCapability>>>;
  clubCapabilities: ReadonlyArray<ClubCapabilityScope>;
  sources: ReadonlyArray<CapabilitySource>;
  limits: Readonly<Record<string, boolean | number | string | null>>;
  expiresAt: string | null;
  checkedAt: string;
  staleAfterSeconds: number;
};

export type RouteWaypointKind = 'start' | 'via' | 'must_stop' | 'finish';

export type RouteWaypoint = {
  id: string;
  sequence: number;
  kind: RouteWaypointKind;
  latitude: number;
  longitude: number;
  label: string;
  providerPlaceId?: string;
};

export type RouteRevision = {
  id: string;
  routeId: string;
  revision: number;
  name: string;
  waypoints: ReadonlyArray<RouteWaypoint>;
  updatedAt: string;
};

export function hasAccountCapability(snapshot: CapabilitySnapshot, capability: AccountCapability, scopeId?: string) {
  return snapshot.accountCapabilities.includes(capability)
    || (scopeId ? snapshot.scopedAccountCapabilities[scopeId]?.includes(capability) ?? false : false);
}

export function canUsePremiumPlanner(snapshot: CapabilitySnapshot) {
  return snapshot.projectionState === 'ready' && hasAccountCapability(snapshot, 'routes.plan');
}

export function hasClubCapability(snapshot: CapabilitySnapshot, clubId: string, capability: ClubCapability) {
  return snapshot.clubCapabilities.some((scope) => scope.clubId === clubId && scope.capabilities.includes(capability));
}
