import { supabase } from '../lib/supabase';

export type RouteWaypoint = {
  kind: 'origin' | 'stop' | 'via' | 'destination';
  displayName: string;
  latitude: number;
  longitude: number;
};

export type RouteLibraryItem = {
  routePlanId: string;
  routeRevisionId: string;
  revisionNumber: number;
  title: string;
  description: string | null;
  regionLabel: string | null;
  distanceMeters: number;
  durationSeconds: number;
  pointCount: number;
  updatedAt: string;
  isFavorite: boolean;
  sourceKind: string | null;
  provenance: string | null;
  waypoints: RouteWaypoint[];
  grantId: string | null;
  grantAllowCopy: boolean;
};

export type RouteLibraryFilter = 'mine' | 'favorites' | 'shared_with_me';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseWaypoint(value: unknown): RouteWaypoint | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const displayName = value.displayName;
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  if (!['origin', 'stop', 'via', 'destination'].includes(String(kind))
    || typeof displayName !== 'string'
    || latitude === null
    || longitude === null) return null;
  return { kind: kind as RouteWaypoint['kind'], displayName, latitude, longitude };
}

export function parseRouteLibraryItem(value: unknown): RouteLibraryItem | null {
  if (!isRecord(value)) return null;
  const routePlanId = value.routePlanId;
  const routeRevisionId = value.routeRevisionId;
  const revisionNumber = finiteNumber(value.revisionNumber);
  const distanceMeters = finiteNumber(value.distanceMeters);
  const durationSeconds = finiteNumber(value.durationSeconds);
  const pointCount = finiteNumber(value.pointCount);
  const updatedAt = value.updatedAt;
  if (typeof routePlanId !== 'string'
    || typeof routeRevisionId !== 'string'
    || revisionNumber === null
    || distanceMeters === null
    || durationSeconds === null
    || pointCount === null
    || typeof updatedAt !== 'string') return null;
  const waypoints = Array.isArray(value.waypoints)
    ? value.waypoints.map(parseWaypoint).filter((item): item is RouteWaypoint => item !== null)
    : [];
  return {
    routePlanId,
    routeRevisionId,
    revisionNumber,
    title: nullableString(value.title) ?? 'Untitled route',
    description: nullableString(value.description),
    regionLabel: nullableString(value.regionLabel),
    distanceMeters,
    durationSeconds,
    pointCount,
    updatedAt,
    isFavorite: value.isFavorite === true,
    sourceKind: nullableString(value.sourceKind),
    provenance: nullableString(value.provenance),
    waypoints,
    grantId: nullableString(value.grantId),
    grantAllowCopy: value.grantAllowCopy === true,
  };
}

function parseRouteList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(parseRouteLibraryItem).filter((item): item is RouteLibraryItem => item !== null);
}

function clientOrThrow() {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  return supabase;
}

export async function listRouteLibrary(filter: RouteLibraryFilter) {
  const client = clientOrThrow();
  const result = filter === 'shared_with_me'
    ? await client.rpc('list_shared_routes', { shared_filter: filter })
    : await client.rpc('list_my_route_library', { library_filter: filter, cursor_before: null });
  if (result.error) throw new Error('KSU could not load your routes. Try again in a moment.');
  return parseRouteList(result.data);
}

export async function getRouteLibraryDetail(routeId: string) {
  const { data, error } = await clientOrThrow().rpc('get_route_library_detail', { route_plan_or_revision_id: routeId });
  const route = error ? null : parseRouteLibraryItem(data);
  if (!route) throw new Error('This route is no longer available to this account.');
  return route;
}

export async function setRouteFavorite(routePlanId: string, favorite: boolean) {
  const { data, error } = await clientOrThrow().rpc('set_route_favorite', {
    target_route_plan_id: routePlanId,
    favorite,
  });
  if (error || data !== favorite) throw new Error('KSU could not update that favorite. Try again.');
  return favorite;
}
