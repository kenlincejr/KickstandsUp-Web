// Web trip read/write surface. The parser and label helpers mirror
// KickstandsUp/src/features/rides/trip-legs.ts field for field so what the
// leader proofreads on the laptop is character-for-character what riders see
// on the phone. The RPC wrappers call the already-live trip contract
// (supabase/migrations/20260727160000_trip_ride_skeleton.sql) — P6 ships no
// migration of its own.
import { supabase } from '../lib/supabase';
import { parseStagingLocations, projectStops, type ProjectedStop } from './trip-stop-projection';

export type TripLeg = {
  id: string;
  /** 0-based day number. Legs are always returned and rendered in this order. */
  dayIndex: number;
  title?: string;
  departAt: string;
  /** Soft target the leader set, never a promise and never a tracked arrival. */
  arriveBy?: string;
  /** The day's premium geometry, when it has any. Geometry only — never stop identity. */
  routeRevisionId?: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  stops: ProjectedStop[];
  lodgingName?: string;
  lodgingAddress?: string;
  bookingUrl?: string;
  checkInAt?: string;
  checkOutAt?: string;
  notes?: string;
};

export type Trip = {
  rideId: string;
  departureAt: string;
  expectedEndAt: string;
  legs: TripLeg[];
};

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function optionalCount(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Parse the get_ride_trip payload. Null for anything that is not a usable trip. */
export function parseTrip(value: unknown): Trip | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rideId = optionalText(raw.rideId);
  const departureAt = optionalTimestamp(raw.departureAt);
  const expectedEndAt = optionalTimestamp(raw.expectedEndAt);
  // The date range is the one thing a trip cannot render without.
  if (!rideId || !departureAt || !expectedEndAt) return null;

  const legs = (Array.isArray(raw.legs) ? raw.legs : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry): TripLeg | null => {
      const id = optionalText(entry.id);
      const departAt = optionalTimestamp(entry.departAt);
      const dayIndex = optionalCount(entry.dayIndex);
      if (!id || !departAt || dayIndex === undefined) return null;
      return {
        id,
        dayIndex,
        title: optionalText(entry.title),
        departAt,
        arriveBy: optionalTimestamp(entry.arriveBy),
        routeRevisionId: optionalText(entry.routeRevisionId),
        plannedDistanceMeters: optionalCount(entry.plannedDistanceMeters),
        plannedDurationSeconds: optionalCount(entry.plannedDurationSeconds),
        // The one stop-identity path: same parser, same projection as the device.
        stops: projectStops(parseStagingLocations(entry.stops) ?? []),
        lodgingName: optionalText(entry.lodgingName),
        lodgingAddress: optionalText(entry.lodgingAddress),
        bookingUrl: optionalText(entry.bookingUrl),
        checkInAt: optionalTimestamp(entry.checkInAt),
        checkOutAt: optionalTimestamp(entry.checkOutAt),
        notes: optionalText(entry.notes),
      };
    })
    .filter((leg): leg is TripLeg => leg !== null)
    .sort((left, right) => left.dayIndex - right.dayIndex);

  return { rideId, departureAt, expectedEndAt, legs };
}

const METERS_PER_MILE = 1609.344;

/** Whole miles across every day that reported a distance; null when none did. */
export function tripTotalMiles(legs: readonly TripLeg[]): number | null {
  const measured = legs.filter((leg) => typeof leg.plannedDistanceMeters === 'number');
  if (!measured.length) return null;
  return Math.round(measured.reduce((total, leg) => total + (leg.plannedDistanceMeters ?? 0), 0) / METERS_PER_MILE);
}

/** "412 mi · 6h 00m" — either half may be missing, and both missing renders nothing. */
export function tripLegDistanceLabel(leg: TripLeg): string | null {
  const parts: string[] = [];
  if (typeof leg.plannedDistanceMeters === 'number') {
    parts.push(`${Math.round(leg.plannedDistanceMeters / METERS_PER_MILE)} mi`);
  }
  if (typeof leg.plannedDurationSeconds === 'number' && leg.plannedDurationSeconds > 0) {
    const minutes = Math.round(leg.plannedDurationSeconds / 60);
    const hours = Math.floor(minutes / 60);
    parts.push(hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function formatDay(value: string, timeZone?: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(parsed);
}

function formatClock(value: string, timeZone?: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(parsed);
}

/** "Fri, Aug 1 – Wed, Aug 6 · 6 days" — the trip card's header line. */
export function tripDateRangeLabel(trip: Trip, timeZone?: string): string {
  const days = tripDayCount(trip);
  const range = `${formatDay(trip.departureAt, timeZone)} – ${formatDay(trip.expectedEndAt, timeZone)}`;
  return `${range} · ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Legs are authoritative when present; falls back to the date span for a trip
 * whose days are not authored yet — exactly the state a web-authored trip is
 * in between create_trip_ride and set_trip_legs. Do not "improve" this.
 */
export function tripDayCount(trip: Trip): number {
  if (trip.legs.length) return trip.legs.length;
  const start = Date.parse(trip.departureAt);
  const end = Date.parse(trip.expectedEndAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

/** "DAY 3 · Tue, Aug 3" — the day card heading. */
export function tripDayHeading(leg: TripLeg, timeZone?: string): string {
  const day = formatDay(leg.departAt, timeZone);
  return day ? `DAY ${leg.dayIndex + 1} · ${day}` : `DAY ${leg.dayIndex + 1}`;
}

/** "Lampasas → Wichita Falls" from the day's own stops; null for a rest day. */
export function tripLegRouteLabel(leg: TripLeg): string | null {
  const names = leg.stops.filter((stop) => (stop.kind ?? 'stop') === 'stop').map((stop) => stop.displayName.trim()).filter(Boolean);
  return names.length ? names.join(' → ') : null;
}

/** "Drury Inn Denver · check-in 3:00 PM · out 11:00 AM"; null without a lodging name. */
export function tripLegOvernightLabel(leg: TripLeg, timeZone?: string): string | null {
  if (!leg.lodgingName) return null;
  const parts = [leg.lodgingName];
  const checkIn = leg.checkInAt ? formatClock(leg.checkInAt, timeZone) : '';
  if (checkIn) parts.push(`check-in ${checkIn}`);
  const checkOut = leg.checkOutAt ? formatClock(leg.checkOutAt, timeZone) : '';
  if (checkOut) parts.push(`out ${checkOut}`);
  return parts.join(' · ');
}

/** The leader's booking link, only when it is plain http(s) with no whitespace. */
export function tripLegBookingUrl(leg: TripLeg): string | null {
  const url = leg.bookingUrl;
  if (!url || /\s/.test(url)) return null;
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

/** "Rolling at 7:00 AM" for the day card's departure line. */
export function tripLegDepartureLabel(leg: TripLeg, timeZone?: string): string | null {
  const clock = formatClock(leg.departAt, timeZone);
  return clock ? `Rolling at ${clock}` : null;
}

/** "Target arrival 4:00 PM" — the soft target; null when the leader left it blank. */
export function tripLegArrivalLabel(leg: TripLeg, timeZone?: string): string | null {
  if (!leg.arriveBy) return null;
  const clock = formatClock(leg.arriveBy, timeZone);
  return clock ? `Target arrival ${clock}` : null;
}

// ── RPC wrappers ────────────────────────────────────────────────────────────

function clientOrThrow() {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  return supabase;
}

export type TripRpcError = Error & { code?: string };

function rpcError(code: string | undefined, message: string | undefined, fallback: string): TripRpcError {
  const error = new Error(message || fallback) as TripRpcError;
  error.code = code;
  return error;
}

/** Reading a trip is free — no entitlement check server-side. Never gate it. */
export async function getRideTrip(rideId: string): Promise<Trip | null> {
  const { data, error } = await clientOrThrow().rpc('get_ride_trip', { target_ride_id: rideId });
  if (error) throw rpcError(error.code, error.message, 'KSU could not load that trip.');
  return parseTrip(data);
}

export type CreateTripInput = {
  /** Minted once per form mount, reused on retry — idempotency key. */
  operationId: string;
  departureAt: string;
  expectedEndAt: string;
  departureLabel: string;
  title: string;
  pace: string | null;
  bikeFit: string | null;
  experienceFit: string | null;
  rideStyle: string | null;
  chatEnabled: boolean;
  maxRiders: number | null;
  notes: string | null;
  surfaceNotes: string | null;
  logisticsNotes: string | null;
  sweepLabel: string | null;
  stagingDisplayName: string;
  stagingAddress: string;
  /** Load-bearing: this is Day 1's fallback nav origin on the device. */
  stagingLatitude: number;
  stagingLongitude: number;
  stagingProviderPlaceId: string | null;
  stagingSource: string;
  publicDescription: string | null;
};

export async function createTripRide(input: CreateTripInput): Promise<string> {
  // Keys are the SQL parameter names verbatim — supabase-js matches by name.
  const { data, error } = await clientOrThrow().rpc('create_trip_ride', {
    operation_id: input.operationId,
    departure_at: input.departureAt,
    expected_end_at: input.expectedEndAt,
    departure_label: input.departureLabel,
    title: input.title,
    pace: input.pace,
    bike_fit: input.bikeFit,
    experience_fit: input.experienceFit,
    ride_style: input.rideStyle,
    chat_enabled: input.chatEnabled,
    max_riders: input.maxRiders,
    notes: input.notes,
    surface_notes: input.surfaceNotes,
    logistics_notes: input.logisticsNotes,
    sweep_label: input.sweepLabel,
    staging_display_name: input.stagingDisplayName,
    staging_address: input.stagingAddress,
    staging_latitude: input.stagingLatitude,
    staging_longitude: input.stagingLongitude,
    staging_provider_place_id: input.stagingProviderPlaceId,
    staging_source: input.stagingSource,
    public_description: input.publicDescription,
  });
  if (error) throw rpcError(error.code, error.message, 'KSU could not create that trip.');
  if (typeof data !== 'string' || !data) throw new Error('KSU could not confirm the new trip.');
  return data;
}

export async function setTripDates(rideId: string, departureAt: string, expectedEndAt: string): Promise<void> {
  const { error } = await clientOrThrow().rpc('set_trip_dates', {
    target_ride_id: rideId,
    departure_at: departureAt,
    expected_end_at: expectedEndAt,
  });
  if (error) throw rpcError(error.code, error.message, 'KSU could not move those dates.');
}

/** Replace-all: the array IS the whole trip. One atomic call per save. */
export async function setTripLegs(rideId: string, legs: unknown[]): Promise<number> {
  const { data, error } = await clientOrThrow().rpc('set_trip_legs', {
    target_ride_id: rideId,
    legs,
  });
  if (error) throw rpcError(error.code, error.message, 'KSU could not save that plan.');
  return typeof data === 'number' ? data : legs.length;
}

export type TripRideMeta = {
  id: string;
  title: string;
  status: string;
  stagingDisplayName: string | null;
  stagingLatitude: number | null;
  stagingLongitude: number | null;
  createdBy: string | null;
};

/**
 * Loaded, or a named reason we could not read it. NOT `TripRideMeta | null`:
 * a null collapses "the read failed" into "you are not the coordinator", and
 * the editor then asserts a false fact about the rider — which is exactly the
 * bug this type replaces. Callers must branch on `state`.
 */
export type TripRideMetaResult =
  | { state: 'loaded'; meta: TripRideMeta }
  | { state: 'unreadable'; reason: string };

/**
 * The parent ride row: title, status, and the staging pin the origin chain
 * falls back to.
 *
 * `staging_latitude`/`staging_longitude` are NOT columns — `public.rides`
 * stores the pin as `staging_point extensions.geography(Point,4326)`
 * (20260712000000_initial_ksu_schema.sql:78), and every `staging_latitude` in
 * the migration tree is an RPC *parameter* fed to st_makepoint. Selecting them
 * made PostgREST fail the whole row with 42703 on every trip for every user,
 * which the old `return null` swallowed into a false "you are not the
 * coordinator" lockout. Do not add them back.
 *
 * Coordinates therefore stay null until a SECURITY DEFINER RPC projects them
 * through st_x/st_y; Autopilot needs them for day 1's origin and stays blocked
 * on that RPC. Everything else here — the coordinator check, the title, the
 * editable gate — works off this select alone.
 */
export async function getTripRideMeta(rideId: string): Promise<TripRideMetaResult> {
  const { data, error } = await clientOrThrow()
    .from('rides')
    .select('id,title,status,staging_display_name,created_by')
    .eq('id', rideId)
    .maybeSingle();
  if (error) return { state: 'unreadable', reason: error.message };
  if (!data || typeof data.id !== 'string') return { state: 'unreadable', reason: 'Trip not found.' };
  return {
    state: 'loaded',
    meta: {
      id: data.id,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'KSU trip',
      status: typeof data.status === 'string' ? data.status : 'scheduled',
      stagingDisplayName: typeof data.staging_display_name === 'string' ? data.staging_display_name : null,
      stagingLatitude: null,
      stagingLongitude: null,
      createdBy: typeof data.created_by === 'string' ? data.created_by : null,
    },
  };
}

export type TripListRow = {
  id: string;
  title: string;
  status: string;
  departureAt: string | null;
  expectedEndAt: string | null;
  stagingDisplayName: string | null;
  createdBy: string | null;
};

/** Every trip the account is authorized to read; RLS is the filter. */
export async function listMyTrips(): Promise<TripListRow[]> {
  const { data, error } = await clientOrThrow()
    .from('rides')
    .select('id,title,status,departure_at,expected_end_at,staging_display_name,created_by,ride_type')
    .eq('ride_type', 'trip')
    .order('departure_at', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw new Error('KSU could not load your trips. Try again in a moment.');
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    if (!row || typeof row !== 'object' || typeof (row as Record<string, unknown>).id !== 'string') return [];
    const record = row as Record<string, unknown>;
    return [{
      id: record.id as string,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : 'KSU trip',
      status: typeof record.status === 'string' ? record.status : 'scheduled',
      departureAt: typeof record.departure_at === 'string' ? record.departure_at : null,
      expectedEndAt: typeof record.expected_end_at === 'string' ? record.expected_end_at : null,
      stagingDisplayName: typeof record.staging_display_name === 'string' ? record.staging_display_name : null,
      createdBy: typeof record.created_by === 'string' ? record.created_by : null,
    }];
  });
}
