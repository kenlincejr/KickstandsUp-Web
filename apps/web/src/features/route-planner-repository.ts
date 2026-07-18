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
  fuelPlan?: { rangeMiles: number; reservePercent: number; source: 'bike_exact' | 'bike_band_estimate' | 'route_override' | 'manual'; plannerVersion: 1; bikeId?: string; bikeLabel?: string };
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
export type RouteWeatherLabel = 'Start' | 'Mid-route' | 'Finish';
export type RouteWeatherPoint = { label: RouteWeatherLabel; latitude: number; longitude: number; etaOffsetSeconds: number };
export type RouteWeatherCondition = {
  label: RouteWeatherLabel; observedAt: string; forecastFor: string | null; description: string; iconUrl: string | null;
  temperatureF: number | null; feelsLikeF: number | null; precipitationChance: number | null; windMph: number | null;
  windGustMph: number | null; visibilityMiles: number | null; source: 'google_weather';
};
export type RouteWeatherResponse = {
  provider: 'google_weather'; conditions: RouteWeatherCondition[]; generatedAt: string; expiresAt: string;
  cacheHit: boolean; freshness: 'current_conditions_fetched_at_generated_at';
};

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

export function isFreshRoutePreview(preview: RoutePreview, now = Date.now()) {
  const expiresAt = Date.parse(preview.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function buildRouteWeatherRequest(preview: RoutePreview) {
  const routePoints = decodePolyline(preview.encodedPolyline);
  if (routePoints.length < 2 || !isFreshRoutePreview(preview)) throw new Error('Refresh the route preview before checking conditions.');
  const durationSeconds = Math.max(0, Math.round(preview.durationSeconds));
  return {
    operationId: crypto.randomUUID(), routePreviewFingerprint: preview.providerRequestHash,
    points: [
      { label: 'Start' as const, ...routePoints[0], etaOffsetSeconds: 0 },
      { label: 'Mid-route' as const, ...routePoints[closestMidpointIndex(routePoints)], etaOffsetSeconds: Math.round(durationSeconds / 2) },
      { label: 'Finish' as const, ...routePoints.at(-1)!, etaOffsetSeconds: durationSeconds },
    ] satisfies RouteWeatherPoint[],
  };
}

export async function getRouteWeather(preview: RoutePreview, signal?: AbortSignal) {
  const payload = await edgeRequest<RouteWeatherResponse>('route-weather', buildRouteWeatherRequest(preview), signal);
  if (!isRouteWeatherResponse(payload)) throw new Error('KSU could not read conditions along that route.');
  return payload;
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

function closestMidpointIndex(points: { latitude: number; longitude: number }[]) {
  const distances = points.slice(1).map((point, index) => haversineMeters(points[index], point));
  const halfway = distances.reduce((total, distance) => total + distance, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < distances.length; index += 1) {
    travelled += distances[index];
    if (travelled >= halfway) return index + 1;
  }
  return Math.floor((points.length - 1) / 2);
}

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function isRouteWeatherResponse(value: RouteWeatherResponse) {
  const labels: RouteWeatherLabel[] = ['Start', 'Mid-route', 'Finish'];
  return value.provider === 'google_weather' && value.freshness === 'current_conditions_fetched_at_generated_at'
    && typeof value.generatedAt === 'string' && typeof value.expiresAt === 'string' && Array.isArray(value.conditions)
    && value.conditions.length === labels.length && value.conditions.every((condition, index) => condition?.label === labels[index]
      && typeof condition.description === 'string' && condition.source === 'google_weather');
}
