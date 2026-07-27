// The set_trip_legs payload builder and validator. Pure — this is where the
// trip contract is test-locked before any component exists (P6 spec §12.2).
//
// The P7 seam: TripDayDraft is a plain serializable array with no dependency
// on how it was produced. Autopilot later adds proposeDays(constraints):
// TripDayDraft[] and hands its output to the same editor and this same builder.
import type { DraftPoint, RouteLegDraft } from './route-leg-editor-core';
import { projectStops, type StagingLocation, type StopLabel } from './trip-stop-projection';

/** A trip-day editor point: the planner draft point plus round-trip passthrough. */
export type TripDraftPoint = DraftPoint & {
  stopId?: string;
  address?: string;
  locality?: string;
  stopLabels?: StopLabel[];
  plannedDepartAt?: string;
  routedLeg?: { fromStopId: string; durationSeconds: number };
};

export type TripDayDraft = {
  /** Stable client key for React lists; never sent to the server. */
  id: string;
  /** Server leg id when this day was loaded from get_ride_trip; informational. */
  legId?: string;
  title: string;
  /** Offset-bearing ISO-8601; required by the server on every day. */
  departAt: string;
  arriveBy: string;
  /** The day's route in the shared editor value. Points carry stop identity. */
  leg: RouteLegDraft & { points: TripDraftPoint[] };
  /** Server-loaded values preserved across a round trip when the day's route
   * was not re-previewed or re-saved this session. */
  routeRevisionId?: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  lodgingName: string;
  lodgingAddress: string;
  bookingUrl: string;
  checkInAt: string;
  checkOutAt: string;
  notes: string;
  /** A rest day saves with zero stops — legal by contract. */
  restDay: boolean;
};

// Server limits, verbatim from 20260727160000 / 20260727170000. The server
// silently left()-truncates the text fields rather than rejecting; enforcing
// the exact limits client-side is what prevents a stored 500-char booking URL
// that goes nowhere.
export const TRIP_LIMITS = {
  maxDays: 30,
  maxStopsPerDay: 6,
  maxStopBytesPerDay: 8192,
  titleMax: 120,
  lodgingNameMax: 180,
  lodgingAddressMax: 240,
  bookingUrlMax: 500,
  notesMax: 1000,
  maxRoutedLegSeconds: 86_400,
} as const;

export const BOOKING_URL_PATTERN = /^https?:\/\/\S+$/;

/**
 * Map a planner point to the StagingLocation wire vocabulary.
 * PlannerWaypoint.source is 'manual' | 'google_place' — a DIFFERENT vocabulary
 * from StagingLocation.source. google_place → place_search; a map-placed
 * manual point (ksu_customer provenance) → dropped_pin; anything else → manual.
 * The device parser silently coerces unmapped values to 'manual', losing
 * provenance, so the mapping happens here, before send.
 */
export function stagingSourceForPoint(point: Pick<TripDraftPoint, 'source' | 'coordinateProvenance'>): StagingLocation['source'] {
  if (point.source === 'google_place') return 'place_search';
  if (point.coordinateProvenance === 'ksu_customer') return 'dropped_pin';
  return 'manual';
}

/**
 * Fold a day's route points into the identity-bearing stop plan.
 * Origin and destination become kind:'stop' (StagingLocation has no
 * origin/destination); intermediates keep their stop/via kind. Only points
 * with a name and finite coordinates qualify — validation rejects the rest
 * before this runs on the save path.
 */
export function dayStopsFromPoints(points: readonly TripDraftPoint[]): StagingLocation[] {
  return points
    .filter((point) => point.displayName.trim().length > 0 && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => {
      const kind = point.kind === 'via' ? 'via' as const : 'stop' as const;
      const routedLeg = kind !== 'via'
        && point.routedLeg
        && Number.isFinite(point.routedLeg.durationSeconds)
        && point.routedLeg.durationSeconds >= 0
        && point.routedLeg.durationSeconds <= TRIP_LIMITS.maxRoutedLegSeconds
        ? point.routedLeg
        : undefined;
      return {
        displayName: point.displayName.trim(),
        address: point.address ?? '',
        latitude: point.latitude,
        longitude: point.longitude,
        locality: point.locality,
        providerPlaceId: point.googlePlaceId,
        source: stagingSourceForPoint(point),
        kind,
        // A via never carries labels, a planned departure, or a routed leg —
        // the device parser strips all three; emitting them wastes byte budget.
        stopLabels: kind !== 'via' && point.stopLabels?.length ? point.stopLabels : undefined,
        plannedDepartAt: kind !== 'via' ? point.plannedDepartAt : undefined,
        routedLeg,
        stopId: point.stopId,
      } satisfies StagingLocation;
    });
}

function compactStop(stop: StagingLocation): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    displayName: stop.displayName,
    address: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
    source: stop.source,
    kind: stop.kind ?? 'stop',
    stopId: stop.stopId,
  };
  if (stop.locality) wire.locality = stop.locality;
  if (stop.providerPlaceId) wire.providerPlaceId = stop.providerPlaceId;
  if (stop.stopLabels?.length) wire.stopLabels = stop.stopLabels;
  if (stop.plannedDepartAt) wire.plannedDepartAt = stop.plannedDepartAt;
  if (stop.routedLeg) wire.routedLeg = stop.routedLeg;
  return wire;
}

export function stopsByteLength(stops: readonly Record<string, unknown>[]): number {
  // The server counts octets (octet_length); .length counts UTF-16 units and
  // disagrees the moment a place name carries a non-ASCII character.
  return new TextEncoder().encode(JSON.stringify(stops)).length;
}

const clean = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

/**
 * Build the set_trip_legs payload for the WHOLE trip.
 * - Days are sorted by departAt ascending; array position IS day_index and no
 *   dayIndex key is ever emitted.
 * - Stop identity is projected ONCE across the flattened trip, never per day:
 *   a per-day pass cannot see the cross-day stopId collision a duplicated day
 *   creates, and that is exactly what the server rejects.
 */
export function buildSetTripLegsPayload(days: readonly TripDayDraft[]): unknown[] {
  const ordered = [...days].sort((left, right) => Date.parse(left.departAt) - Date.parse(right.departAt));
  const perDay = ordered.map((day) => day.restDay ? [] : dayStopsFromPoints(day.leg.points));
  const projected = projectStops(perDay.flat());

  let cursor = 0;
  return ordered.map((day, index) => {
    const stops = perDay[index].map(() => projected[cursor++]).map(compactStop);
    const leg: Record<string, unknown> = { departAt: day.departAt, stops };
    const title = clean(day.title);
    if (title) leg.title = title;
    const arriveBy = clean(day.arriveBy);
    if (arriveBy) leg.arriveBy = arriveBy;
    const routeRevisionId = day.restDay ? undefined : day.leg.saved?.routeRevisionId ?? day.routeRevisionId;
    if (routeRevisionId) leg.routeRevisionId = routeRevisionId;
    const preview = day.restDay ? undefined : day.leg.preview;
    if (preview && !day.leg.previewStale) {
      leg.plannedDistanceMeters = Math.round(preview.distanceMeters);
      leg.plannedDurationSeconds = Math.round(preview.durationSeconds);
    } else if (!day.restDay && typeof day.plannedDistanceMeters === 'number') {
      leg.plannedDistanceMeters = day.plannedDistanceMeters;
      if (typeof day.plannedDurationSeconds === 'number') leg.plannedDurationSeconds = day.plannedDurationSeconds;
    }
    const lodgingName = clean(day.lodgingName);
    if (lodgingName) leg.lodgingName = lodgingName;
    const lodgingAddress = clean(day.lodgingAddress);
    if (lodgingAddress) leg.lodgingAddress = lodgingAddress;
    const bookingUrl = clean(day.bookingUrl);
    if (bookingUrl) leg.bookingUrl = bookingUrl;
    const checkInAt = clean(day.checkInAt);
    if (checkInAt) leg.checkInAt = checkInAt;
    const checkOutAt = clean(day.checkOutAt);
    if (checkOutAt) leg.checkOutAt = checkOutAt;
    const notes = clean(day.notes);
    if (notes) leg.notes = notes;
    return leg;
  });
}

export type TripDayIssue = {
  /** 1-based day number after departAt ordering — matches the rendered list. */
  dayNumber: number;
  field?: 'departAt' | 'arriveBy' | 'stops' | 'bookingUrl' | 'checkOutAt' | 'title' | 'lodgingName' | 'lodgingAddress' | 'notes';
  message: string;
};

export type TripValidationInput = {
  departureAt: string;
  expectedEndAt: string;
};

const DAY_MS = 86_400_000;

/**
 * The pre-send checks of P6 spec §10.1, in order, each naming the day. The
 * server is the enforcement layer; this is the explanation layer.
 */
export function validateTripDays(days: readonly TripDayDraft[], trip: TripValidationInput): TripDayIssue[] {
  const issues: TripDayIssue[] = [];
  if (!days.length) return [{ dayNumber: 1, message: 'Add at least one day before saving.' }];
  if (days.length > TRIP_LIMITS.maxDays) {
    return [{ dayNumber: TRIP_LIMITS.maxDays + 1, message: 'A trip can cover up to 30 days.' }];
  }

  const ordered = [...days].sort((left, right) => Date.parse(left.departAt) - Date.parse(right.departAt));
  const windowStart = Date.parse(trip.departureAt) - DAY_MS;
  const windowEnd = Date.parse(trip.expectedEndAt) + DAY_MS;
  const seenStopIds = new Map<string, number>();

  ordered.forEach((day, index) => {
    const dayNumber = index + 1;
    const departs = Date.parse(day.departAt);
    if (!day.departAt.trim() || !Number.isFinite(departs)) {
      issues.push({ dayNumber, field: 'departAt', message: `Day ${dayNumber} needs a departure time.` });
      return;
    }
    if (Number.isFinite(windowStart) && Number.isFinite(windowEnd) && (departs < windowStart || departs > windowEnd)) {
      issues.push({ dayNumber, field: 'departAt', message: `Day ${dayNumber} is outside the trip's dates. Move the day, or change the trip dates.` });
    }
    if (index > 0) {
      const previous = Date.parse(ordered[index - 1].departAt);
      if (Number.isFinite(previous) && departs < previous) {
        issues.push({ dayNumber, field: 'departAt', message: `Day ${dayNumber} leaves before day ${index}. Days have to run forward.` });
      }
    }

    const stops = day.restDay ? [] : dayStopsFromPoints(day.leg.points);
    if (!day.restDay) {
      const incomplete = day.leg.points.filter((point) => point.displayName.trim().length > 0 || Number.isFinite(point.latitude));
      const unresolved = incomplete.filter((point) => !point.displayName.trim() || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude));
      if (unresolved.length) {
        issues.push({ dayNumber, field: 'stops', message: `Day ${dayNumber} has a point without a confirmed location. Finish it or remove it.` });
      }
    }
    if (stops.length > TRIP_LIMITS.maxStopsPerDay) {
      issues.push({ dayNumber, field: 'stops', message: `Day ${dayNumber} has more than 6 stops or ride-throughs. A day can have up to 6.` });
    }
    for (const stop of stops) {
      if (!stop.displayName.trim()) {
        issues.push({ dayNumber, field: 'stops', message: `One of day ${dayNumber}'s stops has no name.` });
      }
      if (stop.stopId) {
        const first = seenStopIds.get(stop.stopId);
        if (first !== undefined && first !== dayNumber) {
          issues.push({ dayNumber, field: 'stops', message: `Day ${dayNumber} repeats a stop from day ${first}. Duplicate the place, not the stop — remove and re-add it.` });
        } else if (first === dayNumber) {
          issues.push({ dayNumber, field: 'stops', message: `Day ${dayNumber} has two copies of the same stop. Remove one and re-add it.` });
        } else {
          seenStopIds.set(stop.stopId, dayNumber);
        }
      }
    }
    if (stopsByteLength(stops.map(compactStop)) > TRIP_LIMITS.maxStopBytesPerDay) {
      issues.push({ dayNumber, field: 'stops', message: `Day ${dayNumber} is too detailed to save — try shorter place names or fewer stops.` });
    }

    const arriveBy = day.arriveBy.trim();
    if (arriveBy) {
      const arrival = Date.parse(arriveBy);
      if (!Number.isFinite(arrival)) {
        issues.push({ dayNumber, field: 'arriveBy', message: `Day ${dayNumber}'s target arrival isn't a valid time.` });
      } else if (arrival < departs) {
        issues.push({ dayNumber, field: 'arriveBy', message: `Day ${dayNumber}'s target arrival is before its departure.` });
      }
    }
    const checkIn = day.checkInAt.trim();
    const checkOut = day.checkOutAt.trim();
    if (checkIn && checkOut) {
      const inAt = Date.parse(checkIn);
      const outAt = Date.parse(checkOut);
      if (Number.isFinite(inAt) && Number.isFinite(outAt) && outAt <= inAt) {
        issues.push({ dayNumber, field: 'checkOutAt', message: `Day ${dayNumber}'s check-out is before its check-in.` });
      }
    }
    const bookingUrl = day.bookingUrl.trim();
    if (bookingUrl) {
      if (bookingUrl.length > TRIP_LIMITS.bookingUrlMax) {
        issues.push({ dayNumber, field: 'bookingUrl', message: `Day ${dayNumber}'s booking link is too long (over 500 characters). Use a shorter link.` });
      } else if (!BOOKING_URL_PATTERN.test(bookingUrl)) {
        issues.push({ dayNumber, field: 'bookingUrl', message: `Day ${dayNumber}'s booking link has to start with http:// or https:// and contain no spaces.` });
      }
    }
    if (day.title.trim().length > TRIP_LIMITS.titleMax) issues.push({ dayNumber, field: 'title', message: `Day ${dayNumber}'s title is over 120 characters.` });
    if (day.lodgingName.trim().length > TRIP_LIMITS.lodgingNameMax) issues.push({ dayNumber, field: 'lodgingName', message: `Day ${dayNumber}'s lodging name is over 180 characters.` });
    if (day.lodgingAddress.trim().length > TRIP_LIMITS.lodgingAddressMax) issues.push({ dayNumber, field: 'lodgingAddress', message: `Day ${dayNumber}'s lodging address is over 240 characters.` });
    if (day.notes.trim().length > TRIP_LIMITS.notesMax) issues.push({ dayNumber, field: 'notes', message: `Day ${dayNumber}'s notes are over 1,000 characters.` });
  });

  return issues;
}

export type TripAuthoringScore = {
  score: number;
  maxScore: 100;
  passed: boolean;
  missing: string[];
};

/** The P6 acceptance criteria as a compilable artifact (spec §12.4). */
export function scoreTripAuthoring(criteria: {
  extractedEditor: boolean;
  atomicSave: boolean;
  stopIdentityAcrossTrip: boolean;
  originChainMatchesDevice: boolean;
  failClosedEditingReadOpen: boolean;
  perDayErrorCopy: boolean;
  previewBudget: boolean;
  noSilentTruncation: boolean;
}): TripAuthoringScore {
  const checks: Array<[keyof typeof criteria, string, number]> = [
    ['extractedEditor', 'day editor is the extracted planner core', 15],
    ['atomicSave', 'whole itinerary in one set_trip_legs call', 15],
    ['stopIdentityAcrossTrip', 'stop ids minted once across the whole trip', 20],
    ['originChainMatchesDevice', 'day N seeds from day N-1 like the device', 15],
    ['failClosedEditingReadOpen', 'stale pauses editing, never reading', 10],
    ['perDayErrorCopy', 'every server error routes to a day and a field', 10],
    ['previewBudget', 'manual serialized previews with dailyRemaining surfaced', 10],
    ['noSilentTruncation', 'length caps enforced client-side at server limits', 5],
  ];
  const missing = checks.filter(([key]) => !criteria[key]).map(([, label]) => label);
  return {
    score: checks.filter(([key]) => criteria[key]).reduce((total, [, , value]) => total + value, 0),
    maxScore: 100,
    passed: missing.length === 0,
    missing,
  };
}
