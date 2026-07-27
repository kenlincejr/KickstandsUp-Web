// Converts a solved AutopilotPlan into the trip editor's TripDayDraft[] shape
// (trip-payload.ts) — the P7/trip-autopilot-spec-2026-07-26 §6.1 seam trip-payload.ts's
// header comment predicted: "Autopilot later adds proposeDays(constraints):
// TripDayDraft[] and hands its output to the same editor and this same builder."
//
// Pure and side-effect-free: no network, no Supabase, no set_trip_legs call.
// Accepting a plan and handing back drafts is the entire contract — the
// caller (the trip editor page, via "Use these days") is the only place that
// ever touches `days` state, and the LEADER still has to press Save for
// set_trip_legs to run (spec: "a solve never calls set_trip_legs, only the
// existing Save").
import { createRouteLegDraft } from '../route-leg-editor-core';
import type { TripDraftPoint } from '../trip-payload';
import type { TripDayDraft } from '../trip-payload';
import type { AutopilotPlan, TripLegDraft } from './trip-autopilot';

/** The trip window the drafts are being built for. Kept in the signature (not
 *  used to clamp `departAt` today — the solver already computed every
 *  `departAt` against this same window via `AutopilotRequest.departAt`) so a
 *  future caller has it on hand without changing the call shape, and so this
 *  function's contract reads the same as trip-payload.ts's own
 *  `validateTripDays(days, trip)`. */
export type AutopilotDraftTripWindow = { departureAt: string; expectedEndAt: string };

function blankOriginPoint(): TripDraftPoint {
  // Day N's real origin is the PREVIOUS day's finish (or the trip's staging
  // pin for day 1) — exactly what `tripLegOrigin` (trip-origin.ts) computes
  // when the leader adds a manual day. Autopilot does not duplicate that
  // logic here: a blank origin point is dropped by `dayStopsFromPoints`
  // (empty displayName), so the payload carries only the day's ONE anchor
  // stop, matching what the solver itself produced (`TripLegDraft.stops` is
  // always a single-stop array, never an origin+destination pair — §4.12).
  return { id: crypto.randomUUID(), kind: 'origin', displayName: '' };
}

function blankDestinationPoint(): TripDraftPoint {
  return { id: crypto.randomUUID(), kind: 'destination', displayName: '' };
}

/**
 * A riding day's one anchor stop (§4.12: `stops: [buildDraftStop(to, day)]`)
 * becomes the day's destination point. `kind: 'stop'`, `source: 'manual'` —
 * Autopilot never resolves through Google Places (§3.2b: names come from the
 * free Photon/reverse-geocode resolver, never a paid lookup) — and the
 * deterministic `stopId` the solver minted is carried through UNCHANGED, so
 * the identity survives `buildSetTripLegsPayload`'s own `projectStops` pass
 * (which preserves an existing, not-yet-seen stopId rather than re-minting
 * it — trip-stop-projection.ts's documented behavior).
 */
function destinationPointFromLeg(leg: TripLegDraft): TripDraftPoint {
  const anchor = leg.stops[0];
  if (!anchor) return blankDestinationPoint();
  return {
    id: crypto.randomUUID(),
    kind: 'destination',
    displayName: anchor.displayName,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    source: 'manual',
    coordinateProvenance: 'ksu_customer',
    stopId: anchor.stopId,
  };
}

/**
 * Convert a solved `AutopilotPlan` into the editor's `TripDayDraft[]`. Every
 * riding day gets a fresh draft id, its `departAt` straight from the leg (the
 * solver already validated it lands inside the trip window — §4.12's
 * contract-obligations table), and its reason string in `notes` (empty on
 * every fresh draft, so "only if empty" is unconditionally satisfied here —
 * this function only ever produces NEW drafts, never merges into a day a
 * human already annotated). Autopilot writes NO lodging columns (§3.2c):
 * `lodgingName`/`lodgingAddress`/`bookingUrl`/`checkInAt`/`checkOutAt` are
 * always the empty string, so `tripLegOvernightLabel` renders nothing until
 * the leader taps "Find lodging near X" and fills them in by hand.
 */
export function autopilotDaysToDrafts(plan: AutopilotPlan, trip: AutopilotDraftTripWindow): TripDayDraft[] {
  void trip; // see AutopilotDraftTripWindow's docstring — accepted for signature parity, not consulted today
  return plan.legs.map((leg) => {
    const restDay = leg.stops.length === 0;
    return {
      id: crypto.randomUUID(),
      title: '',
      departAt: leg.departAt,
      arriveBy: leg.arriveBy ?? '',
      leg: {
        ...createRouteLegDraft({ title: 'Trip day' }),
        points: restDay
          ? [blankOriginPoint(), blankDestinationPoint()]
          : [blankOriginPoint(), destinationPointFromLeg(leg)],
      } as TripDayDraft['leg'],
      plannedDistanceMeters: leg.plannedDistanceMeters,
      plannedDurationSeconds: leg.plannedDurationSeconds,
      lodgingName: '',
      lodgingAddress: '',
      bookingUrl: '',
      checkInAt: '',
      checkOutAt: '',
      notes: leg.reason,
      restDay,
    } satisfies TripDayDraft;
  });
}
