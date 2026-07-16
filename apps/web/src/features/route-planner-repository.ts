import { supabase } from '../lib/supabase';
import { publicEnv } from '../lib/env';

export type PlannerWaypoint = {
  kind: 'origin' | 'stop' | 'via' | 'destination';
  displayName: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  source: 'manual' | 'google_place';
  coordinateProvenance: 'ksu_customer' | 'google_places';
};

export type RouteDefinition = {
  title: string;
  waypoints: PlannerWaypoint[];
  avoidHighways: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
};

export type PlaceSuggestion = { placeId: string; primaryText: string; secondaryText?: string };
export type ResolvedPlace = { placeId: string; displayName: string; address?: string; latitude: number; longitude: number };
export type RoutePreview = {
  operationId: string;
  provider: 'google_routes';
  providerRequestHash: string;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  calculatedAt: string;
  expiresAt: string;
  cacheHit: boolean;
  dailyRemaining?: number;
};
export type SavedRevision = { routePlanId: string; routeRevisionId: string; revisionNumber: number };

function clientOrThrow() {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  return supabase;
}

async function sessionToken() {
  const { data } = await clientOrThrow().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sign in to use the route planner.');
  return data.session.access_token;
}

async function edgeRequest<T>(functionName: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch(`/api/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: publicEnv.supabasePublishableKey,
      Authorization: `Bearer ${await sessionToken()}`,
      'Content-Type': 'application/json',
      'x-ksu-platform': 'web',
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'KSU could not complete that request.');
  return payload;
}

export async function searchPlaces(input: string, sessionTokenValue: string, signal?: AbortSignal) {
  const payload = await edgeRequest<{ suggestions?: PlaceSuggestion[] }>('place-search', {
    action: 'autocomplete', input, sessionToken: sessionTokenValue, operationId: crypto.randomUUID(),
  }, signal);
  return Array.isArray(payload.suggestions) ? payload.suggestions : [];
}

export async function resolvePlace(placeId: string, sessionTokenValue: string, signal?: AbortSignal) {
  const payload = await edgeRequest<{ place?: ResolvedPlace }>('place-search', {
    action: 'details', placeId, sessionToken: sessionTokenValue, operationId: crypto.randomUUID(),
  }, signal);
  if (!payload.place) throw new Error('KSU could not use that place.');
  return payload.place;
}

export function isCompleteDefinition(definition: RouteDefinition) {
  return definition.waypoints.length >= 2
    && definition.waypoints.length <= 27
    && definition.waypoints[0]?.kind === 'origin'
    && definition.waypoints.at(-1)?.kind === 'destination'
    && definition.waypoints.every((point) => point.displayName.trim()
      && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
      && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}

export async function previewRoute(definition: RouteDefinition, signal?: AbortSignal) {
  return edgeRequest<RoutePreview>('route-preview', { operationId: crypto.randomUUID(), definition }, signal);
}

export async function saveRoute(definition: RouteDefinition, preview: RoutePreview, routePlanId?: string) {
  const { data, error } = await clientOrThrow().rpc('save_route_revision', {
    target_route_plan_id: routePlanId ?? null,
    route_definition: definition,
    route_preview: preview,
  });
  if (error) throw new Error(error.message || 'KSU could not save that route.');
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row.route_plan_id !== 'string' || typeof row.route_revision_id !== 'string' || typeof row.revision_number !== 'number') {
    throw new Error('KSU could not confirm the saved revision.');
  }
  return { routePlanId: row.route_plan_id, routeRevisionId: row.route_revision_id, revisionNumber: row.revision_number } satisfies SavedRevision;
}

export function decodePolyline(encoded: string) {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    const decode = () => {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      return (result & 1) ? ~(result >> 1) : result >> 1;
    };
    latitude += decode();
    longitude += decode();
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}
