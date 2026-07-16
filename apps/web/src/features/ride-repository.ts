import { supabase } from '../lib/supabase';
import type { RouteWaypoint } from './route-library-repository';

export type RiderRide = {
  id: string;
  title: string;
  status: string;
  departureAt: string | null;
  departureLabel: string | null;
  stagingDisplayName: string;
  stagingAddress: string | null;
  pace: string | null;
  rideType: string;
  routeRevisionId: string | null;
};

export type AuthorizedRideRoute = {
  routeRevisionId: string;
  revisionNumber: number;
  distanceMeters: number;
  durationSeconds: number;
  waypoints: RouteWaypoint[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function parseRiderRide(value: unknown): RiderRide | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string') return null;
  return {
    id: value.id,
    title: nullableString(value.title) ?? (value.ride_type === 'meetup' ? 'KSU meetup' : 'KSU ride'),
    status: value.status,
    departureAt: nullableString(value.departure_at),
    departureLabel: nullableString(value.departure_label),
    stagingDisplayName: nullableString(value.staging_display_name) ?? 'Staging details in KSU',
    stagingAddress: nullableString(value.staging_address),
    pace: nullableString(value.pace),
    rideType: nullableString(value.ride_type) ?? 'ride',
    routeRevisionId: nullableString(value.route_revision_id),
  };
}

function parseWaypoint(value: unknown): RouteWaypoint | null {
  if (!isRecord(value)
    || !['origin', 'stop', 'via', 'destination'].includes(String(value.kind))
    || typeof value.displayName !== 'string'
    || typeof value.latitude !== 'number'
    || typeof value.longitude !== 'number') return null;
  return {
    kind: value.kind as RouteWaypoint['kind'],
    displayName: value.displayName,
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

export function parseAuthorizedRideRoute(value: unknown): AuthorizedRideRoute | null {
  if (!isRecord(value)
    || typeof value.routeRevisionId !== 'string'
    || typeof value.revisionNumber !== 'number'
    || typeof value.plannedDistanceMeters !== 'number'
    || typeof value.plannedDurationSeconds !== 'number') return null;
  return {
    routeRevisionId: value.routeRevisionId,
    revisionNumber: value.revisionNumber,
    distanceMeters: value.plannedDistanceMeters,
    durationSeconds: value.plannedDurationSeconds,
    waypoints: Array.isArray(value.waypoints)
      ? value.waypoints.map(parseWaypoint).filter((item): item is RouteWaypoint => item !== null)
      : [],
  };
}

function clientOrThrow() {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  return supabase;
}

export async function listMyRides() {
  const { data, error } = await clientOrThrow().from('rides').select('id,status,departure_at,departure_label,staging_display_name,staging_address,pace,title,ride_type,route_revision_id').order('departure_at', { ascending: false, nullsFirst: false }).limit(50);
  if (error) throw new Error('KSU could not load your rides. Try again in a moment.');
  return (Array.isArray(data) ? data : []).map(parseRiderRide).filter((ride): ride is RiderRide => ride !== null);
}

export async function getAuthorizedRideRoute(rideId: string) {
  const { data, error } = await clientOrThrow().rpc('get_authorized_ride_route', { target_ride_id: rideId });
  const route = error ? null : parseAuthorizedRideRoute(data);
  if (!route) throw new Error('This ride does not have an available route.');
  return route;
}

export function stagingMapsUrl(ride: RiderRide) {
  const query = ride.stagingAddress ?? ride.stagingDisplayName;
  const parameters = new URLSearchParams({ api: '1', query });
  return `https://www.google.com/maps/search/?${parameters.toString()}`;
}
