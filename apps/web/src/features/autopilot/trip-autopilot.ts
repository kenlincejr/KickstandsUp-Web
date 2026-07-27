/**
 * Byte-parity port of C:\KickstandsUp\src\features\rides\trip-autopilot.ts
 * (device repo, KickstandsUp). Ported for trip-autopilot-spec-2026-07-26 §6.1
 * ("The solver module is shared, not reimplemented ... it ports to ksu-web
 * verbatim"). The arithmetic, weights, DP, and tie-breaks below are
 * byte-identical to the device source. ONLY the imports are adapted to this
 * repo's module layout:
 *   - `haversineMiles` / `LatLng` come from `./autopilot-helpers` (a minimal
 *     pure port of `@/features/maps/leg-estimate`) instead of the device's
 *     `@/features/maps/leg-estimate`.
 *   - `buildFuelPlan` comes from `./autopilot-helpers` (a minimal pure port
 *     of `@/features/routes/fuel-plan`) instead of the device's
 *     `@/features/routes/fuel-plan`.
 *   - `projectStops` / `StagingLocation` come from `../trip-stop-projection`
 *     (ksu-web's existing byte-compatible port of the device's
 *     `stop-projection.ts`, already used by trip-payload.ts) instead of the
 *     device's `./stop-projection` / `./ride-store`.
 *   - `solarEvents` comes from `./daylight` (a sibling byte-parity port in
 *     this same folder) instead of the device's `./daylight`.
 * No arithmetic, weight, or behavior change of any kind was made in this
 * port. If the device source changes, re-port this file.
 */
import { haversineMiles, buildFuelPlan, type LatLng } from './autopilot-helpers';
import { projectStops, type StagingLocation } from '../trip-stop-projection';
import { solarEvents } from './daylight';
import { buildReason, buildTrade, type JustificationInput } from './trip-autopilot-reasons';

type DraftStagingLocation = StagingLocation & { stopId: string; kind: 'stop' };

/**
 * Trip Autopilot solver — trip-autopilot spec §4. A pure, deterministic,
 * offline DP over candidate break points on a route profile derived from ONE
 * paid route preview.
 *
 * Purity contract (spec §4.1), mirrored from arrival-estimate.ts /
 * stop-projection.ts:
 * - No `fetch`, no Supabase client, no `Date.now()` — the caller passes
 *   `departAt`. No randomness anywhere in the solve, including id minting:
 *   output stop ids are a deterministic function of (riding day, candidate
 *   pointIndex) — see `deterministicStopId` — never `crypto.randomUUID()`.
 *   `projectStops` still runs once at the very end as the trip-wide
 *   uniqueness guard (P-7) and WOULD fall back to `createStopId()`'s
 *   randomness on an actual id collision, but the inputs above are already
 *   unique by construction, so that fallback is not expected to fire — same
 *   request in, byte-identical output out, ids included (P-1).
 * - No network of any kind. UI-free. Jest-safe: no value import from
 *   ride-store, only the pure siblings (`stop-projection`, `leg-estimate` via
 *   its `haversineMiles`, `fuel-plan`, `daylight`).
 * - Given identical inputs, byte-identical output, forever (§4.8, tested by
 *   P-1).
 *
 * Deliberately NOT here: the impure Photon/reverse-geocode name resolver
 * (§4.5 step 2 — candidates arrive already named), the write path to
 * `set_trip_legs` (§4.12, §9.2 — P6's job), any UI.
 */

// ---------------------------------------------------------------------------
// Route profile (§4.2)
// ---------------------------------------------------------------------------

/** One sample along the previewed route. Monotonic in both cumulative fields. */
export type RouteProfilePoint = {
  latitude: number;
  longitude: number;
  /** Metres from the route origin, along the road. */
  cumulativeMeters: number;
  /** Seconds of driving from the route origin. Excludes all dwell. */
  cumulativeSeconds: number;
};

export type RouteProfile = {
  points: RouteProfilePoint[]; // >= 2, index 0 is the origin
  totalMeters: number;
  totalSeconds: number;
  /** True when durations were apportioned along the polyline rather than read
   *  per-leg. Drives the honesty language in §4.10. */
  interpolated: boolean;
};

/** The per-leg distance/duration shape parsed off a route-preview response (route-preview/legs.ts). */
export type ProfileLeg = { distanceMeters: number; durationSeconds: number };

function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineMiles(a, b) * 1609.344;
}

/**
 * Build the solver's world from a decoded overview polyline plus the parsed
 * per-leg distances/durations from the SAME `computeRoutes` response (§4.2).
 *
 * Leg boundaries are expressed as cumulative distance (`legs[k].distanceMeters`
 * summed), not as separate waypoint coordinates — the overview polyline
 * carries no leg-boundary markers of its own, so each vertex is assigned to
 * the leg whose cumulative-distance range contains its (haversine-scaled)
 * position along the route. Within a leg, duration is apportioned to each
 * vertex in proportion to its haversine share of that leg's length — the
 * `route-fuel-markers.ts` technique, extended from one span to N.
 *
 * When `legs` is absent (`parseRouteLegs` fail-soft, `legs.ts:44`), the whole
 * route's duration — `routes.duration` off the SAME `computeRoutes` response
 * (§4.2 step 5) — is apportioned across the whole path instead via
 * `wholeRouteDurationSeconds`, and `interpolated` is set — every downstream
 * reason string widens its language. Without this parameter there is no
 * duration to apportion at all in the fallback case (F1: `legsTotalSeconds`
 * is always 0 when `legs` is undefined, silently zeroing every arrival/dark/
 * saddle computation on a route whose provider response omitted `legs`).
 */
export function buildRouteProfile(
  path: LatLng[],
  legs: ProfileLeg[] | undefined,
  wholeRouteDurationSeconds = 0,
): RouteProfile {
  if (path.length < 2) {
    const only = path[0];
    const point = only
      ? { latitude: only.latitude, longitude: only.longitude, cumulativeMeters: 0, cumulativeSeconds: 0 }
      : { latitude: 0, longitude: 0, cumulativeMeters: 0, cumulativeSeconds: 0 };
    return { points: [point, { ...point }], totalMeters: 0, totalSeconds: 0, interpolated: true };
  }

  const cumulativeHaversine: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulativeHaversine.push(cumulativeHaversine[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  const pathTotal = cumulativeHaversine[cumulativeHaversine.length - 1];

  const legsTotalMeters = legs?.reduce((sum, leg) => sum + leg.distanceMeters, 0) ?? 0;
  const legsTotalSeconds = legs?.reduce((sum, leg) => sum + leg.durationSeconds, 0) ?? 0;

  if (!legs || legs.length === 0) {
    // Whole-route fallback (§4.2 step 5): apportion the CALLER-SUPPLIED whole-
    // route duration across the whole path, proportional to haversine share.
    const totalSeconds = Math.max(0, wholeRouteDurationSeconds);
    const points: RouteProfilePoint[] = path.map((p, i) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      cumulativeMeters: cumulativeHaversine[i],
      cumulativeSeconds: pathTotal > 0 ? totalSeconds * (cumulativeHaversine[i] / pathTotal) : 0,
    }));
    return { points, totalMeters: pathTotal, totalSeconds, interpolated: true };
  }

  // Scale the polyline's own cumulative haversine onto the provider's stated
  // total distance, so leg boundaries (expressed in provider-distance space)
  // land on the correct vertices even though haversine chord length and the
  // provider's road distance are never bit-identical.
  const scale = pathTotal > 0 && legsTotalMeters > 0 ? legsTotalMeters / pathTotal : 1;

  // Cumulative distance (provider space) at the END of each leg.
  const legEndMeters: number[] = [];
  let running = 0;
  for (const leg of legs) {
    running += leg.distanceMeters;
    legEndMeters.push(running);
  }

  const points: RouteProfilePoint[] = [];
  let legIndex = 0;
  for (let i = 0; i < path.length; i += 1) {
    const scaledMeters = cumulativeHaversine[i] * scale;
    // Advance to the leg whose end boundary is at or beyond this vertex —
    // walking forward only, since both sequences are monotonic.
    while (legIndex < legs.length - 1 && scaledMeters > legEndMeters[legIndex] + 1e-6) legIndex += 1;

    const legStartMeters = legIndex === 0 ? 0 : legEndMeters[legIndex - 1];
    const legEndMetersHere = legEndMeters[legIndex];
    const legSpan = legEndMetersHere - legStartMeters;
    const secondsBeforeThisLeg = legs.slice(0, legIndex).reduce((sum, leg) => sum + leg.durationSeconds, 0);
    const fraction = legSpan > 0 ? Math.max(0, Math.min(1, (scaledMeters - legStartMeters) / legSpan)) : 1;
    const cumulativeSeconds = secondsBeforeThisLeg + legs[legIndex].durationSeconds * fraction;

    points.push({
      latitude: path[i].latitude,
      longitude: path[i].longitude,
      cumulativeMeters: scaledMeters,
      cumulativeSeconds,
    });
  }

  return { points, totalMeters: legsTotalMeters, totalSeconds: legsTotalSeconds, interpolated: false };
}

// ---------------------------------------------------------------------------
// Candidate derivation (§4.5)
// ---------------------------------------------------------------------------

export type AnchorNameSource = 'place_search' | 'reverse_geocode' | 'none';

export type AnchorCandidate = {
  /** Index into RouteProfile.points. Candidates are ordered by this. */
  pointIndex: number;
  cumulativeMeters: number;
  cumulativeSeconds: number;
  latitude: number;
  longitude: number;
  /** Free-resolved name (§3.2b). Null only when both free sources failed. */
  name: string | null;
  /** How the name was obtained — drives the reason string's confidence. */
  nameSource: AnchorNameSource;
  /** Metres from the route line to the named place's own coordinates. */
  offRouteMeters: number;
};

/** What the (impure, out-of-phase) name resolver would have produced for one sampled point. */
export type ResolvedAnchorName = { name: string | null; nameSource: AnchorNameSource; offRouteMeters: number };

export const SAMPLE_STRIDE_METERS = 40_000;
export const MAX_CANDIDATES = 64;
export const MAX_OFF_ROUTE_METERS = 32_000;

/**
 * The pure sampling/dedup/off-route-drop half of §4.5. `resolveName` stands
 * in for the impure Photon → reverse-geocode → none resolver (§3.2b, §4.5
 * step 2) — a plain function here, not a network call, so this stays pure and
 * jest-safe; the actual resolver runs once, before the solve, and its output
 * is exactly this callback's shape.
 *
 * Procedure (§4.5):
 * 1. Sample at `SAMPLE_STRIDE_METERS`, widening the stride if the route is
 *    long enough to overflow `MAX_CANDIDATES`.
 * 2. Resolve each sample (via the injected callback).
 * 3. Dedupe by resolved name, keeping the smallest `offRouteMeters`.
 * 4. Drop candidates whose `offRouteMeters` exceeds `MAX_OFF_ROUTE_METERS`.
 * 5. Origin and terminus are always included and never dropped by 3 or 4.
 */
export function deriveCandidateSamples(
  profile: RouteProfile,
  resolveName: (pointIndex: number) => ResolvedAnchorName,
): AnchorCandidate[] {
  const points = profile.points;
  if (points.length < 2) return [];
  const lastIndex = points.length - 1;

  // Widen the stride until sampling the route yields at most MAX_CANDIDATES
  // interior samples plus the two fixed endpoints.
  let strideMeters = SAMPLE_STRIDE_METERS;
  const sampleIndices = () => {
    const indices: number[] = [0];
    let nextTarget = strideMeters;
    for (let i = 1; i < lastIndex; i += 1) {
      if (points[i].cumulativeMeters >= nextTarget) {
        indices.push(i);
        nextTarget = points[i].cumulativeMeters + strideMeters;
      }
    }
    indices.push(lastIndex);
    return indices;
  };

  let indices = sampleIndices();
  while (indices.length > MAX_CANDIDATES && strideMeters < profile.totalMeters * 2 + 1) {
    strideMeters *= 2;
    indices = sampleIndices();
  }
  if (indices.length > MAX_CANDIDATES) {
    // Pathological input (e.g. thousands of points crammed under one
    // stride's width even after doubling many times) — hard-cap by taking an
    // even spread across the sampled index list, endpoints preserved.
    const kept = [0];
    const interior = indices.slice(1, -1);
    const stepCount = MAX_CANDIDATES - 2;
    for (let k = 0; k < stepCount; k += 1) {
      kept.push(interior[Math.floor((k * (interior.length - 1)) / Math.max(1, stepCount - 1))]);
    }
    kept.push(lastIndex);
    indices = Array.from(new Set(kept)).sort((a, b) => a - b);
  }

  const raw = indices.map((pointIndex) => {
    const resolved = resolveName(pointIndex);
    const point = points[pointIndex];
    return {
      pointIndex,
      cumulativeMeters: point.cumulativeMeters,
      cumulativeSeconds: point.cumulativeSeconds,
      latitude: point.latitude,
      longitude: point.longitude,
      name: resolved.name,
      nameSource: resolved.nameSource,
      offRouteMeters: resolved.offRouteMeters,
    } satisfies AnchorCandidate;
  });

  // Dedupe by name (endpoints and unnamed candidates are never merged away).
  const byName = new Map<string, AnchorCandidate>();
  const kept: AnchorCandidate[] = [];
  for (const candidate of raw) {
    const isEndpoint = candidate.pointIndex === 0 || candidate.pointIndex === lastIndex;
    if (!isEndpoint && candidate.name) {
      const existing = byName.get(candidate.name);
      if (existing) {
        if (candidate.offRouteMeters < existing.offRouteMeters) {
          const idx = kept.indexOf(existing);
          kept[idx] = candidate;
          byName.set(candidate.name, candidate);
        }
        continue;
      }
      byName.set(candidate.name, candidate);
    }
    kept.push(candidate);
  }

  // Drop off-route candidates beyond the ceiling — endpoints are exempt.
  return kept.filter((candidate) => {
    const isEndpoint = candidate.pointIndex === 0 || candidate.pointIndex === lastIndex;
    return isEndpoint || candidate.offRouteMeters <= MAX_OFF_ROUTE_METERS;
  });
}

// ---------------------------------------------------------------------------
// Request shape (§4.4)
// ---------------------------------------------------------------------------

export type Hardness = 'hard' | 'soft';
export type Constrained<T> = { value: T; mode: Hardness };

export type DayShape = 'even' | 'front_loaded' | 'back_loaded';

export type AutopilotRequest = {
  /** Absolute ISO instant the trip departs. All arithmetic is epoch-ms on
   *  absolute instants — the DST rule from arrival-estimate.ts:31-40. */
  departAt: string;
  /**
   * The leader's expected_end_at target, when they set one. Wrapped in
   * `Constrained` (the source spec's inline snippet shows a bare `string`,
   * but §4.6/§4.9 both treat `returnBy` as a hard/soft dial identical to the
   * other three — the source snippet is stale; built against the prose. See
   * the build report for this resolved ambiguity).
   */
  returnBy?: Constrained<string>;
  /** Fixed day count when the leader pinned it; otherwise the solver chooses. */
  dayCount?: Constrained<number>;

  profile: RouteProfile;
  candidates: AnchorCandidate[]; // §4.5, already named, already free

  saddleBudgetSeconds: Constrained<number>; // default 6 h
  dayShape: DayShape; // default 'even'
  inBeforeDark: Constrained<boolean>; // default true/soft
  restCadenceSeconds: number; // default 2 h — advisory only, not solver input in v1
  fuel?: { rangeMiles: number; reservePercent: number };
  overnightStandard: 'any'; // v1 has exactly one value — §3
  weatherPosture: 'suggest' | 'off'; // never consulted by the solver — §7
  dwellSecondsPerStop?: number; // default DEFAULT_DWELL_MINUTES — advisory only
};

export type AutopilotOptions = {
  /** Autopilot Lite (§6.2): Dmax = 3 (rest days count), every dial soft, no
   *  relaxation UI — a route that cannot fit refuses rather than proposing a
   *  bad 3-day plan. */
  lite?: boolean;
};

// ---------------------------------------------------------------------------
// The objective (§4.6) — exported weights, tuning not architecture
// ---------------------------------------------------------------------------

export const W_SADDLE = 4;
export const W_DARK = 6;
export const W_SHAPE = 1;
export const W_ANCHOR_UNNAMED = 250;
export const W_OFFROUTE = 8;
export const W_SHORT = 3;
export const MIN_DAY_SECONDS = 5400;
export const W_FUEL = 2;
export const W_DAY = 150;
export const W_CALENDAR = 12;

const METERS_PER_MILE = 1609.344;
const DAY_MS = 24 * 60 * 60 * 1000;

function wholeMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
function wholeMiles(meters: number): number {
  return Math.round(meters / METERS_PER_MILE);
}

/** `departAt` shifted by `k-1` whole days — pure epoch-ms arithmetic, never a wall-clock field add. */
function dayDepartAtMs(departAtMs: number, dayNumber1Based: number): number {
  return departAtMs + (dayNumber1Based - 1) * DAY_MS;
}

function targetSecondsForDay(totalSeconds: number, dayShape: DayShape, k: number, dMax: number): number {
  if (dMax <= 1) return totalSeconds;
  const even = totalSeconds / dMax;
  if (dayShape === 'even') return even;
  const t = (k - 1) / (dMax - 1); // 0..1
  const factor = dayShape === 'front_loaded' ? 1.25 - 0.5 * t : 0.75 + 0.5 * t;
  return even * factor;
}

/**
 * daylight.ts's documented contract: pass a `Date` anchored NEAR UTC NOON of
 * the calendar day being asked about, because the module reads only the
 * `Date`'s UTC Y-M-D — anything else risks the ±12h of timezone slop around a
 * UTC-midnight boundary flipping which calendar day gets evaluated (F4: a
 * late-evening US departure, e.g. 9:30pm CDT, is already past UTC midnight —
 * `dayDepartAtMs` used to feed that raw instant straight into `solarEvents`,
 * silently asking for the WRONG day's sunset and making `darkPenalty` vanish
 * on exactly the trips it matters most for).
 *
 * There is no lat/lon → IANA-timezone lookup in this tree, so "the arrival's
 * own calendar day" is approximated by shifting the arrival instant by the
 * candidate's longitude (15°/hour) before reading its UTC date fields — a
 * rough but directionally-correct stand-in that fixes the UTC-midnight
 * flip without pulling in a timezone database.
 */
function approximateLocalDateKey(ms: number, longitude: number): { key: string; noonUtcMs: number } {
  const offsetMs = (longitude / 15) * 60 * 60 * 1000;
  const shifted = new Date(ms + offsetMs);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return { key: `${y}-${m}-${d}`, noonUtcMs: Date.UTC(y, m, d, 12, 0, 0) };
}

export type DayCostBreakdown = {
  total: number;
  saddlePenalty: number;
  darkPenalty: number;
  shapePenalty: number;
  anchorPenalty: number;
  shortDayPenalty: number;
  fuelPenalty: number;
  driveSeconds: number;
  driveMeters: number;
  arrivalAtIso: string;
  minutesAfterSunset: number | null;
  sunsetAt: string | null;
  /** The longest single candidate-to-candidate gap WITHIN this day (F2) — what fuelPenalty actually prices. */
  longestGapMeters: number;
};

type CachedSolarEvents = { sunriseAt: string | null; sunsetAt: string | null };

/** Solver-internal context threaded through every `dayCost` call. */
export type SolveContext = {
  request: AutopilotRequest;
  departAtMs: number;
  candidates: AnchorCandidate[];
  sunsetMemo: Map<string, CachedSolarEvents>;
};

/** Memo key is (candidate, APPROXIMATE local calendar day of the arrival) — not the trip's raw day-start instant (F4). */
function memoizedSolarEvents(ctx: SolveContext, candidate: AnchorCandidate, arrivalMs: number): CachedSolarEvents {
  const { key: dateKey, noonUtcMs } = approximateLocalDateKey(arrivalMs, candidate.longitude);
  const key = `${candidate.pointIndex}:${dateKey}`;
  const cached = ctx.sunsetMemo.get(key);
  if (cached) return cached;
  const events = solarEvents(new Date(noonUtcMs), candidate.latitude, candidate.longitude);
  ctx.sunsetMemo.set(key, events);
  return events;
}

/**
 * The largest single hop between CONSECUTIVE candidates spanning `[fromIndex,
 * toIndex]` (F2) — candidates strictly between the two day-break points are
 * still points along the route that weren't chosen as breaks, and a fuel-gap
 * hazard is about the longest unbroken stretch WITHIN the day, not the day's
 * total mileage. Equals `driveMeters` exactly when there are no intermediate
 * candidates (the common case).
 */
function longestGapWithinDay(candidates: readonly AnchorCandidate[], fromIndex: number, toIndex: number): number {
  let longest = 0;
  for (let k = fromIndex; k < toIndex; k += 1) {
    const gap = candidates[k + 1].cumulativeMeters - candidates[k].cumulativeMeters;
    if (gap > longest) longest = gap;
  }
  return longest;
}

/**
 * The per-day cost of driving from candidate `i` to candidate `j` on riding
 * day `dayNumber1Based`, with day-shape targets computed against `dMax` (the
 * DP's current outer day-count trial — §4.7's pseudocode literally passes
 * `Dmax`, not the eventual winning day count, into every `dayCost` call).
 *
 * Returns `Infinity` when a HARD constraint is violated — the DP prunes that
 * transition entirely (never a plan that silently violates a hard dial).
 */
export function dayCost(
  ctx: SolveContext,
  fromIndex: number,
  toIndex: number,
  dayNumber1Based: number,
  dMax: number,
): DayCostBreakdown {
  const from = ctx.candidates[fromIndex];
  const to = ctx.candidates[toIndex];
  const driveSeconds = Math.max(0, to.cumulativeSeconds - from.cumulativeSeconds);
  const driveMeters = Math.max(0, to.cumulativeMeters - from.cumulativeMeters);
  const request = ctx.request;

  // saddle
  const overSaddleSeconds = Math.max(0, driveSeconds - request.saddleBudgetSeconds.value);
  const saddleHardViolated = request.saddleBudgetSeconds.mode === 'hard' && overSaddleSeconds > 0;
  const saddlePenalty = saddleHardViolated ? Infinity : wholeMinutes(overSaddleSeconds) * W_SADDLE;

  // dark
  const dayStartMs = dayDepartAtMs(ctx.departAtMs, dayNumber1Based);
  const arrivalMs = dayStartMs + driveSeconds * 1000;
  const arrivalAtIso = new Date(arrivalMs).toISOString();
  const events = memoizedSolarEvents(ctx, to, arrivalMs);
  let sunsetAt = events.sunsetAt;
  let darkPenalty = 0;
  let minutesAfterSunset: number | null = null;
  let darkHardViolated = false;
  if (sunsetAt) {
    const sunsetMs = new Date(sunsetAt).getTime();
    let afterMinutes = Math.round((arrivalMs - sunsetMs) / 60_000);
    // A post-midnight arrival can land BEFORE its own calendar day's sunset
    // (that sunset is still hours in the future) while still being in the
    // dark — before that day's sunrise. Reprice relative to the PREVIOUS
    // calendar day's sunset so "minutes after sunset" stays a real, positive
    // measure of how deep into the night the arrival actually is, instead of
    // silently reading as "before sunset, no penalty."
    if (afterMinutes <= 0 && events.sunriseAt && arrivalMs < new Date(events.sunriseAt).getTime()) {
      const previousDay = memoizedSolarEvents(ctx, to, arrivalMs - DAY_MS);
      if (previousDay.sunsetAt) {
        sunsetAt = previousDay.sunsetAt;
        afterMinutes = Math.round((arrivalMs - new Date(previousDay.sunsetAt).getTime()) / 60_000);
      }
    }
    if (afterMinutes > 0) {
      minutesAfterSunset = afterMinutes;
      darkHardViolated = request.inBeforeDark.mode === 'hard' && request.inBeforeDark.value === true;
      darkPenalty = darkHardViolated ? Infinity : afterMinutes * W_DARK;
    }
  }

  // shape
  const target = targetSecondsForDay(request.profile.totalSeconds, request.dayShape, dayNumber1Based, dMax);
  const shapePenalty = wholeMinutes(Math.abs(driveSeconds - target)) * W_SHAPE;

  // anchor
  const offRouteMiles = wholeMiles(to.offRouteMeters);
  const anchorPenalty = (to.name === null ? W_ANCHOR_UNNAMED : 0) + offRouteMiles * W_OFFROUTE;

  // short day
  const shortDayPenalty = W_SHORT * wholeMinutes(Math.max(0, MIN_DAY_SECONDS - driveSeconds));

  // fuel — F2: prices the LONGEST candidate-to-candidate gap WITHIN the day
  // (spec §4.6), not the day's total distance. With no candidates between `i`
  // and `j` the two are the same number (driveMeters); with intermediate
  // candidates a long day made of short hops never trips this penalty even
  // though a long day made of one giant hop does.
  const longestGapMeters = longestGapWithinDay(ctx.candidates, fromIndex, toIndex);
  let fuelPenalty = 0;
  if (request.fuel) {
    const plan = buildFuelPlan(1, request.fuel.rangeMiles, request.fuel.reservePercent);
    const usableRangeMiles = plan ? request.fuel.rangeMiles - plan.reserveMiles : request.fuel.rangeMiles;
    const gapMiles = longestGapMeters / METERS_PER_MILE;
    fuelPenalty = W_FUEL * Math.round(Math.max(0, gapMiles - usableRangeMiles));
  }

  const hardInfinite = saddleHardViolated || darkHardViolated;
  const total = hardInfinite
    ? Infinity
    : saddlePenalty + darkPenalty + shapePenalty + anchorPenalty + shortDayPenalty + fuelPenalty;

  return {
    total,
    saddlePenalty,
    darkPenalty,
    shapePenalty,
    anchorPenalty,
    shortDayPenalty,
    fuelPenalty,
    driveSeconds,
    driveMeters,
    arrivalAtIso,
    minutesAfterSunset,
    sunsetAt,
    longestGapMeters,
  };
}

// ---------------------------------------------------------------------------
// The DP (§4.7, §4.8)
// ---------------------------------------------------------------------------

const MAX_DAY_INDEX = 30; // ride_trip_legs.day_index between 0 and 29

type DpTables = {
  dp: number[][]; // dp[k][j]
  from: number[][]; // from[k][j] = i
  dMax: number;
};

function runDp(ctx: SolveContext, dMax: number): DpTables {
  const m = ctx.candidates.length;
  const dp: number[][] = Array.from({ length: dMax + 1 }, () => new Array(m).fill(Infinity));
  const from: number[][] = Array.from({ length: dMax + 1 }, () => new Array(m).fill(-1));
  dp[0][0] = 0;

  for (let k = 1; k <= dMax; k += 1) {
    for (let j = 1; j < m; j += 1) {
      for (let i = 0; i < j; i += 1) {
        const prev = dp[k - 1][i];
        if (!Number.isFinite(prev)) continue;
        const cost = dayCost(ctx, i, j, k, dMax).total;
        if (!Number.isFinite(cost)) continue;
        const candidateTotal = prev + cost;
        if (candidateTotal < dp[k][j]) {
          dp[k][j] = candidateTotal;
          from[k][j] = i;
        }
      }
    }
  }
  return { dp, from, dMax };
}

function reconstructPath(tables: DpTables, k: number, terminusIndex: number): number[] {
  const path: number[] = [terminusIndex];
  let node = terminusIndex;
  for (let day = k; day >= 1; day -= 1) {
    const prev = tables.from[day][node];
    if (prev < 0) return []; // unreachable — caller must have already checked dp[k][terminusIndex] is finite
    path.push(prev);
    node = prev;
  }
  return path.reverse(); // [0, ..., terminusIndex], length k+1
}

function dayCountPenalty(request: AutopilotRequest, k: number): number {
  if (!request.dayCount) return W_DAY * k;
  if (request.dayCount.mode === 'hard') return k === request.dayCount.value ? 0 : Infinity;
  return W_DAY * Math.abs(k - request.dayCount.value);
}

/**
 * F10: the finish instant is computed UNCONDITIONALLY, whether or not
 * `returnBy` is set — tie-break rule 3 (§4.8, "earliest finish") must apply
 * to every solve, not only ones with a `returnBy`. `calendarPenalty` itself
 * (the returnBy-specific cost) still short-circuits to 0 when there's no
 * `returnBy` to be over.
 */
function planFinishMs(ctx: SolveContext, tables: DpTables, k: number, terminusIndex: number): number | null {
  const path = reconstructPath(tables, k, terminusIndex);
  if (!path.length) return null;
  const lastLegFrom = path[path.length - 2];
  const breakdown = dayCost(ctx, lastLegFrom, terminusIndex, k, tables.dMax);
  return new Date(breakdown.arrivalAtIso).getTime();
}

function calendarPenalty(ctx: SolveContext, tables: DpTables, k: number, terminusIndex: number): { penalty: number; finishMs: number | null } {
  const finishMs = planFinishMs(ctx, tables, k, terminusIndex);
  if (!ctx.request.returnBy || finishMs === null) return { penalty: 0, finishMs };
  const returnByMs = new Date(ctx.request.returnBy.value).getTime();
  const overHours = Math.max(0, Math.ceil((finishMs - returnByMs) / (60 * 60 * 1000)));
  if (overHours === 0) return { penalty: 0, finishMs };
  if (ctx.request.returnBy.mode === 'hard') return { penalty: Infinity, finishMs };
  return { penalty: overHours * W_CALENDAR, finishMs };
}

type Scored = { k: number; total: number; finishMs: number | null; path: number[] };

/** Full 4-rule deterministic tie-break (§4.8). */
function pickBest(candidates: Scored[]): Scored | null {
  const finite = candidates.filter((c) => Number.isFinite(c.total));
  if (!finite.length) return null;
  finite.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total; // 1. lowest total cost
    if (a.k !== b.k) return a.k - b.k; // 2. fewest riding days
    const aFinish = a.finishMs ?? -Infinity;
    const bFinish = b.finishMs ?? -Infinity;
    if (aFinish !== bFinish) return aFinish - bFinish; // 3. earliest finish
    for (let idx = 0; idx < Math.max(a.path.length, b.path.length); idx += 1) {
      const av = a.path[idx] ?? -1;
      const bv = b.path[idx] ?? -1;
      if (av !== bv) return av - bv; // 4. lexicographically smallest break sequence
    }
    return 0;
  });
  return finite[0];
}

/** Exported for test re-derivation only (P-10) — not part of the calling contract. */
export function deriveCeiling(request: AutopilotRequest, m: number, lite: boolean): number {
  const structuralCeiling = Math.min(MAX_DAY_INDEX, Math.max(1, m - 1));
  if (lite) return Math.min(3, structuralCeiling);
  // A HARD dayCount genuinely bounds the search (only that k is ever valid).
  // A SOFT dayCount is a preference priced by dayCountPenalty — it must not
  // shrink the DP's search space, or demoting it during relaxation (§4.9)
  // would still be unable to reach a larger, feasible day count.
  if (request.dayCount?.mode === 'hard') return Math.min(structuralCeiling, request.dayCount.value);
  return structuralCeiling;
}

// ---------------------------------------------------------------------------
// Output (§4.12)
// ---------------------------------------------------------------------------

export type AutopilotTrade = {
  dayIndex: number; // 0-based, matches TripLegDraft array position
  dial: 'saddle' | 'dark' | 'shape' | 'fuel' | 'returnBy';
  message: string;
};

export type TripLegDraft = {
  title?: string;
  departAt: string;
  arriveBy?: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  stops: { stopId: string; displayName: string; kind: 'stop' | 'via'; latitude?: number; longitude?: number }[];
  notes?: string;
  reason: string;
};

export type AutopilotPlan = {
  legs: TripLegDraft[];
  trades: AutopilotTrade[];
  totalMeters: number;
  totalSeconds: number;
  cost: number;
};

export type AutopilotConflictBinding = 'saddle' | 'dark' | 'dayCount' | 'returnBy' | 'route';

export type AutopilotConflict = {
  binding: AutopilotConflictBinding;
  message: string;
  relaxation?: {
    dial: AutopilotConflictBinding;
    action: 'demote' | 'raise';
    suggestedValue?: number;
    preview: AutopilotPlan;
  };
};

export type AutopilotResult = { status: 'solved'; plan: AutopilotPlan } | { status: 'infeasible'; conflict: AutopilotConflict };

const HARD_DIAL_NAMES = ['dayCount', 'saddle', 'dark', 'returnBy'] as const;
type HardDialName = (typeof HARD_DIAL_NAMES)[number];

function hardDials(request: AutopilotRequest): HardDialName[] {
  const hard: HardDialName[] = [];
  if (request.dayCount?.mode === 'hard') hard.push('dayCount');
  if (request.saddleBudgetSeconds.mode === 'hard') hard.push('saddle');
  if (request.inBeforeDark.mode === 'hard' && request.inBeforeDark.value === true) hard.push('dark');
  if (request.returnBy?.mode === 'hard') hard.push('returnBy');
  return hard;
}

/** §4.4: "At most two dials may be hard at once", enforced at the request boundary. */
export function assertAtMostTwoHardDials(request: AutopilotRequest): void {
  const hard = hardDials(request);
  if (hard.length > 2) {
    throw new Error(`Autopilot: at most two hard dials, got ${hard.length} (${hard.join(', ')})`);
  }
}

function demote(request: AutopilotRequest, dial: HardDialName): AutopilotRequest {
  switch (dial) {
    case 'dayCount':
      return request.dayCount ? { ...request, dayCount: { ...request.dayCount, mode: 'soft' } } : request;
    case 'saddle':
      return { ...request, saddleBudgetSeconds: { ...request.saddleBudgetSeconds, mode: 'soft' } };
    case 'dark':
      return { ...request, inBeforeDark: { ...request.inBeforeDark, mode: 'soft' } };
    case 'returnBy':
      return request.returnBy ? { ...request, returnBy: { ...request.returnBy, mode: 'soft' } } : request;
    default:
      return request;
  }
}

/**
 * F7: deterministic, not `crypto.randomUUID()` — a stable function of the
 * candidate's `pointIndex` and the riding day it was chosen for, both of
 * which are already unique per leg by construction (the DP walks strictly
 * forward through distinct candidates, one per riding day). `projectStops`
 * still runs as the final trip-wide guard (P-7) and WOULD re-mint via
 * `createStopId()` on an actual collision — but a collision should never
 * happen given these inputs, so in the normal case the ids below survive
 * unchanged and two solves of the identical request are byte-identical,
 * including ids (P-1).
 */
function deterministicStopId(dayIndex1Based: number, candidate: AnchorCandidate): string {
  return `ap-d${dayIndex1Based}-c${candidate.pointIndex}`;
}

function buildDraftStop(candidate: AnchorCandidate, dayIndex1Based: number): DraftStagingLocation {
  const displayName = candidate.name ?? `Mile ${wholeMiles(candidate.cumulativeMeters)}`;
  return {
    stopId: deterministicStopId(dayIndex1Based, candidate),
    displayName,
    address: '',
    source: 'manual',
    kind: 'stop',
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
}

/** Whole-plan minimum riding days implied purely by the saddle budget, ignoring hardness — the Lite refusal rule (§6.2). */
function minimumRidingDays(request: AutopilotRequest): number {
  const budget = Math.max(1, request.saddleBudgetSeconds.value);
  return Math.max(1, Math.ceil(request.profile.totalSeconds / budget));
}

/**
 * Candidates ordered by `pointIndex` — the DP requires ascending route order
 * to reach `j` from `i < j`. Sorted defensively rather than trusted from the
 * caller, so a shuffled `AutopilotRequest.candidates` array (P-1) still
 * yields the identical plan.
 */
export function sortCandidatesByPointIndex(candidates: readonly AnchorCandidate[]): AnchorCandidate[] {
  return [...candidates].sort((a, b) => a.pointIndex - b.pointIndex);
}

function solveOnce(request: AutopilotRequest, lite: boolean): { result: AutopilotResult; scoredAll: Scored[]; ctx: SolveContext } | null {
  const candidates = sortCandidatesByPointIndex(request.candidates);
  const m = candidates.length;
  if (m < 2 || request.profile.points.length < 2) {
    return null;
  }
  const departAtMs = new Date(request.departAt).getTime();
  const ctx: SolveContext = { request, departAtMs, candidates, sunsetMemo: new Map() };
  const dMax = deriveCeiling(request, m, lite);
  if (dMax < 1) return null;
  const tables = runDp(ctx, dMax);

  const scoredAll: Scored[] = [];
  for (let k = 1; k <= dMax; k += 1) {
    const dpValue = tables.dp[k][m - 1];
    if (!Number.isFinite(dpValue)) continue;
    const dcp = dayCountPenalty(request, k);
    const { penalty: calp, finishMs } = calendarPenalty(ctx, tables, k, m - 1);
    const total = dpValue + dcp + calp;
    if (!Number.isFinite(total)) continue;
    const path = reconstructPath(tables, k, m - 1);
    if (!path.length) continue;
    scoredAll.push({ k, total, finishMs, path });
  }

  const best = pickBest(scoredAll);
  if (!best) {
    return { result: { status: 'infeasible', conflict: { binding: 'route', message: 'No plan satisfies the request.' } }, scoredAll, ctx };
  }

  const plan = buildPlanFromPath(ctx, tables, best);
  return { result: { status: 'solved', plan }, scoredAll, ctx };
}

type DraftLeg = Omit<TripLegDraft, 'stops'> & { stops: DraftStagingLocation[] };

function buildPlanFromPath(ctx: SolveContext, tables: DpTables, best: Scored): AutopilotPlan {
  const { path, k } = best;
  const legs: DraftLeg[] = [];
  const trades: AutopilotTrade[] = [];
  let totalMeters = 0;
  let totalSeconds = 0;

  for (let day = 1; day <= k; day += 1) {
    const fromIdx = path[day - 1];
    const toIdx = path[day];
    const breakdown = dayCost(ctx, fromIdx, toIdx, day, tables.dMax);
    const to = ctx.candidates[toIdx];
    const isTerminusDay = toIdx === ctx.candidates.length - 1;

    totalMeters += breakdown.driveMeters;
    totalSeconds += breakdown.driveSeconds;

    const reason = buildDayReason(ctx, fromIdx, toIdx, day, k, tables.dMax, breakdown, isTerminusDay);

    legs.push({
      departAt: new Date(dayDepartAtMs(ctx.departAtMs, day)).toISOString(),
      plannedDistanceMeters: Math.round(breakdown.driveMeters),
      plannedDurationSeconds: Math.round(breakdown.driveSeconds),
      stops: [buildDraftStop(to, day)],
      reason,
    });

    for (const trade of dayTrades(ctx, day - 1, breakdown)) trades.push(trade);
  }

  // Rest-day insertion (§4.7, F5): only when returnBy is PINNED (hard) and
  // riding finishes with whole calendar days to spare, appended at the
  // terminus, capped so the total leg count never exceeds 30 (P-5).
  const restDays = deriveRestDayCount(ctx, tables, best);
  const terminus = ctx.candidates[ctx.candidates.length - 1];
  for (let r = 0; r < restDays; r += 1) {
    const dayNumber = k + 1 + r;
    legs.push({
      departAt: new Date(dayDepartAtMs(ctx.departAtMs, dayNumber)).toISOString(),
      plannedDistanceMeters: 0,
      plannedDurationSeconds: 0,
      stops: [],
      reason: buildRestReason(terminus, ctx.request.profile.interpolated),
    });
  }

  // Whole-plan returnBy trade, if the finish itself is over and soft.
  if (ctx.request.returnBy && ctx.request.returnBy.mode === 'soft') {
    const { penalty, finishMs } = calendarPenalty(ctx, tables, k, ctx.candidates.length - 1);
    if (penalty > 0 && finishMs !== null) {
      trades.push({
        dayIndex: legs.length - 1,
        dial: 'returnBy',
        message: buildCalendarTrade(finishMs, ctx.request.returnBy.value),
      });
    }
  }

  const projected = projectStops(legs.flatMap((leg) => leg.stops)); // mint/dedupe across the WHOLE trip (P-7)
  let cursor = 0;
  const finalLegs = legs.map((leg) => {
    const stops = leg.stops.map(() => projected[cursor++]).map((s) => ({
      stopId: s.stopId as string,
      displayName: s.displayName,
      kind: 'stop' as const,
      latitude: s.latitude,
      longitude: s.longitude,
    }));
    return { ...leg, stops };
  });

  return { legs: finalLegs, trades, totalMeters, totalSeconds, cost: best.total };
}

/**
 * F5: rest-day insertion only fires when `returnBy` is PINNED — read literally
 * per §4.7 ("when returnBy is pinned"), that means HARD, not merely present.
 * A SOFT `returnBy` is a preference the objective already prices via
 * `calendarPenalty`/`W_CALENDAR` (and, when violated, surfaces as the
 * whole-plan `returnBy` trade) — it is not a commitment to fill every
 * remaining calendar day with a rest leg. Treating "soft and present" the
 * same as "pinned" was the bug: a generous, unpinned returnBy could emit
 * dozens of rest legs for no reason the rider asked for.
 *
 * Also caps the total leg count at 30 (`ride_trip_legs.day_index` 0..29,
 * `set_trip_legs`'s own cap, P-5) — a far-out hard `returnBy` on a short
 * route could otherwise ask for far more rest days than the contract allows.
 */
function deriveRestDayCount(ctx: SolveContext, tables: DpTables, best: Scored): number {
  if (!ctx.request.returnBy || ctx.request.returnBy.mode !== 'hard') return 0;
  const returnByMs = new Date(ctx.request.returnBy.value).getTime();
  if (!Number.isFinite(returnByMs) || best.finishMs === null) return 0;
  const calendarDaysAvailable = Math.floor((returnByMs - ctx.departAtMs) / DAY_MS) + 1;
  const surplus = calendarDaysAvailable - best.k;
  const capped = Math.min(Math.max(0, surplus), MAX_DAY_INDEX - best.k);
  return Math.max(0, capped);
}

// ---------------------------------------------------------------------------
// Reason / trade composition (delegates final assembly to trip-autopilot-reasons.ts)
// ---------------------------------------------------------------------------

function shapeFallback(ctx: SolveContext): JustificationInput {
  return { kind: 'shape', frontLoaded: ctx.request.dayShape === 'even' ? null : ctx.request.dayShape === 'front_loaded' };
}

/**
 * F3: the daylight clause is the POSITIVE case only — "stopping here gets you
 * in before sunset" — and only when that is genuinely why this break beat
 * going further today. An arrival AFTER sunset never gets this clause; it
 * gets its dark TRADE instead (§4.11), never a reason claiming daylight.
 * "This break is why" is tested directly: would continuing to the NEXT
 * candidate today have crossed into dark? If not, stopping here bought
 * nothing daylight-wise and some other clause should explain the choice.
 */
function daylightPositiveJustification(
  ctx: SolveContext,
  fromIdx: number,
  toIdx: number,
  day: number,
  dMax: number,
  breakdown: DayCostBreakdown,
): JustificationInput | null {
  if (ctx.request.inBeforeDark.value !== true) return null;
  if (!breakdown.sunsetAt || breakdown.minutesAfterSunset !== null) return null; // unknown or already after sunset
  const next = ctx.candidates[toIdx + 1];
  if (!next) return null;
  const hypothetical = dayCost(ctx, fromIdx, toIdx + 1, day, dMax);
  if (hypothetical.minutesAfterSunset === null) return null; // continuing further was fine too — dark wasn't the deciding factor
  const sunsetMs = new Date(breakdown.sunsetAt).getTime();
  const arrivalMs = new Date(breakdown.arrivalAtIso).getTime();
  const minutesBefore = Math.max(0, Math.round((sunsetMs - arrivalMs) / 60_000));
  return { kind: 'daylight', minutesBeforeSunset: minutesBefore, sunsetLocal: breakdown.sunsetAt };
}

/** F14: only within 20 mi of the ideal budget distance (this day's own pace), whether that lands slightly under or right at it. */
function budgetPositiveJustification(ctx: SolveContext, breakdown: DayCostBreakdown): JustificationInput | null {
  if (breakdown.driveSeconds <= 0) return null;
  const paceMph = breakdown.driveMeters / METERS_PER_MILE / (breakdown.driveSeconds / 3600);
  const idealMiles = (ctx.request.saddleBudgetSeconds.value / 3600) * paceMph;
  const dayMiles = breakdown.driveMeters / METERS_PER_MILE;
  if (Math.abs(dayMiles - idealMiles) <= 20) {
    return { kind: 'budget', saddleLabel: saddleLabel(ctx.request.saddleBudgetSeconds.value) };
  }
  return null;
}

/** F13: the dead `* 0` used to zero the slack term every time. Real slack = budget minutes left today, in miles at today's own pace. */
function spacingPositiveJustification(ctx: SolveContext, toIdx: number, breakdown: DayCostBreakdown): JustificationInput | null {
  const to = ctx.candidates[toIdx];
  const next = ctx.candidates[toIdx + 1];
  if (!next) return null;
  const remainingSlackSeconds = Math.max(0, ctx.request.saddleBudgetSeconds.value - breakdown.driveSeconds);
  const paceMetersPerSecond = breakdown.driveSeconds > 0 ? breakdown.driveMeters / breakdown.driveSeconds : 0;
  const remainingSlackMiles = wholeMiles(remainingSlackSeconds * paceMetersPerSecond);
  const gapMiles = wholeMiles(next.cumulativeMeters - to.cumulativeMeters);
  if (gapMiles >= 1.4 * Math.max(1, remainingSlackMiles)) {
    return { kind: 'spacing', nextFurtherMiles: gapMiles };
  }
  return null;
}

function dominantJustification(
  ctx: SolveContext,
  fromIdx: number,
  toIdx: number,
  day: number,
  dMax: number,
  breakdown: DayCostBreakdown,
  isTerminusDay: boolean,
): JustificationInput | null {
  if (isTerminusDay) return { kind: 'terminus' };

  // Positive-framing clauses first — each is only returned when its own
  // condition genuinely holds (F3/F14/F13), in the priority order the worked
  // example (§5) implies: a real daylight save beats "close to budget" beats
  // "the next town is far" beats a generic violation.
  const daylight = daylightPositiveJustification(ctx, fromIdx, toIdx, day, dMax, breakdown);
  if (daylight) return daylight;

  const budget = budgetPositiveJustification(ctx, breakdown);
  if (budget) return budget;

  const spacing = spacingPositiveJustification(ctx, toIdx, breakdown);
  if (spacing) return spacing;

  // Genuine violations (fuel/shape only — saddle and dark violations are
  // reported via their TRADE, never claimed as a reason, F3/F4).
  const violationTerms: { kind: 'fuel' | 'shape'; value: number }[] = [
    { kind: 'fuel', value: breakdown.fuelPenalty },
    { kind: 'shape', value: breakdown.shapePenalty },
  ];
  violationTerms.sort((a, b) => b.value - a.value);
  const top = violationTerms[0];
  if (top.value > 0) {
    if (top.kind === 'fuel') return { kind: 'fuel', gapMiles: wholeMiles(breakdown.longestGapMeters) };
    return shapeFallback(ctx);
  }

  return shapeFallback(ctx);
}

function saddleLabel(seconds: number): string {
  const hours = seconds / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}

function buildDayReason(
  ctx: SolveContext,
  fromIdx: number,
  toIdx: number,
  day: number,
  k: number,
  dMax: number,
  breakdown: DayCostBreakdown,
  isTerminusDay: boolean,
): string {
  const to = ctx.candidates[toIdx];
  const justification = dominantJustification(ctx, fromIdx, toIdx, day, dMax, breakdown, isTerminusDay);
  return buildReason({
    anchorName: to.name,
    milesThisDay: wholeMiles(breakdown.driveMeters),
    justification,
    interpolated: ctx.request.profile.interpolated,
    fallbackMileMarker: wholeMiles(to.cumulativeMeters),
  });
}

function buildRestReason(terminus: AnchorCandidate, interpolated: boolean): string {
  const anchorName = terminus.name ?? `Mile ${wholeMiles(terminus.cumulativeMeters)}`;
  return buildReason({
    anchorName,
    milesThisDay: 0,
    justification: { kind: 'rest', anchorName },
    interpolated,
    fallbackMileMarker: wholeMiles(terminus.cumulativeMeters),
  });
}

function buildCalendarTrade(finishMs: number, returnByIso: string): string {
  const extraDays = Math.max(1, Math.ceil((finishMs - new Date(returnByIso).getTime()) / DAY_MS));
  return buildTrade({
    dayIndex1Based: 0,
    dial: 'returnBy',
    violation: 'the trip runs past your return date',
    consequence: `adds ${extraDays === 1 ? 'a day' : `${extraDays} days`}`,
  });
}

/**
 * F12 (gate round-1, doc-honesty): each `consequence` string below is
 * illustrative canned copy, not derived from re-running the DP with this
 * day's transition forbidden (the real runner-up per §4.11). See
 * `TradeInput.consequence`'s docstring in trip-autopilot-reasons.ts for the
 * full note — flagged as future work rather than silently claimed as done.
 */
function dayTrades(ctx: SolveContext, dayIndex0Based: number, breakdown: DayCostBreakdown): AutopilotTrade[] {
  const trades: AutopilotTrade[] = [];
  const dayIndex1Based = dayIndex0Based + 1;

  if (ctx.request.saddleBudgetSeconds.mode === 'soft' && breakdown.saddlePenalty > 0) {
    // The budget expressed in this day's own miles-per-hour, so "over your N
    // mi day" is honest about the pace actually driven, not a made-up average.
    const paceMph = breakdown.driveMeters / METERS_PER_MILE / (breakdown.driveSeconds / 3600);
    const budgetMilesAtThisPace = Math.round((ctx.request.saddleBudgetSeconds.value / 3600) * paceMph);
    trades.push({
      dayIndex: dayIndex0Based,
      dial: 'saddle',
      message: buildTrade({
        dayIndex1Based,
        dial: 'saddle',
        violation: `runs ${wholeMiles(breakdown.driveMeters)} mi, over your ${budgetMilesAtThisPace} mi day`,
        consequence: `keeps this leg at ${wholeMinutes(breakdown.driveSeconds)} min in the saddle rather than splitting it`,
      }),
    });
  }
  if (ctx.request.inBeforeDark.mode === 'soft' && breakdown.darkPenalty > 0 && breakdown.minutesAfterSunset) {
    trades.push({
      dayIndex: dayIndex0Based,
      dial: 'dark',
      message: buildTrade({
        dayIndex1Based,
        dial: 'dark',
        violation: `gets in ${breakdown.minutesAfterSunset} min after sunset`,
        consequence: 'adds a day to stay ahead of dark',
      }),
    });
  }
  if (ctx.request.fuel && breakdown.fuelPenalty > 0) {
    // F2: named after what fuelPenalty actually measures — the longest single
    // gap WITHIN the day, not the day's total mileage.
    trades.push({
      dayIndex: dayIndex0Based,
      dial: 'fuel',
      message: buildTrade({
        dayIndex1Based,
        dial: 'fuel',
        violation: `has a ${wholeMiles(breakdown.longestGapMeters)} mi gap longer than your bike's usable range`,
        consequence: 'moves the break closer in, at the cost of a shorter day',
      }),
    });
  }
  return trades;
}

// ---------------------------------------------------------------------------
// Top-level solve (§4.7, §4.9)
// ---------------------------------------------------------------------------

// §4.9's priority order happens to be the same list HARD_DIAL_NAMES already
// declares (dayCount → saddle → dark → returnBy) — one array, not two.
const RELAXATION_PRIORITY: readonly HardDialName[] = HARD_DIAL_NAMES;

function bindingFromDial(dial: HardDialName): AutopilotConflictBinding {
  return dial;
}

export function solveAutopilot(request: AutopilotRequest, options: AutopilotOptions = {}): AutopilotResult {
  assertAtMostTwoHardDials(request);
  const lite = Boolean(options.lite);

  if (lite) {
    const minDays = minimumRidingDays(request);
    if (minDays > 3) {
      return {
        status: 'infeasible',
        conflict: {
          binding: 'dayCount',
          message: `This route needs about ${minDays} riding days at your saddle budget — Autopilot Lite only plans up to 3. Plan this on the web for more days.`,
        },
      };
    }
  }

  const outcome = solveOnce(request, lite);
  if (!outcome) {
    return { status: 'infeasible', conflict: { binding: 'route', message: 'The route has no usable candidates to break on.' } };
  }
  if (outcome.result.status === 'solved') return outcome.result;
  if (lite) return outcome.result; // no relaxation UI on device (§6.2)

  // Infeasible: search the smallest relaxation, priority dayCount → saddle → dark → returnBy.
  const currentlyHard = hardDials(request);
  for (const dial of RELAXATION_PRIORITY) {
    if (!currentlyHard.includes(dial)) continue;
    const relaxedRequest = demote(request, dial);
    const relaxedOutcome = solveOnce(relaxedRequest, lite);
    if (relaxedOutcome && relaxedOutcome.result.status === 'solved') {
      return {
        status: 'infeasible',
        conflict: {
          binding: bindingFromDial(dial),
          message: relaxationMessage(dial),
          relaxation: { dial: bindingFromDial(dial), action: 'demote', preview: relaxedOutcome.result.plan },
        },
      };
    }
  }

  return { status: 'infeasible', conflict: { binding: 'route', message: 'No combination of relaxed dials makes this route fit.' } };
}

/**
 * Rebuild the exact `SolveContext` a real solve would use for `request` —
 * exported purely so invariant tests (P-10) can re-derive a day's cost
 * breakdown independently of `buildPlanFromPath`'s own bookkeeping, without
 * duplicating the sort/memo-setup logic (and risking THAT drifting instead).
 */
export function createSolveContextForTesting(request: AutopilotRequest): SolveContext {
  return {
    request,
    departAtMs: new Date(request.departAt).getTime(),
    candidates: sortCandidatesByPointIndex(request.candidates),
    sunsetMemo: new Map(),
  };
}

function relaxationMessage(dial: HardDialName): string {
  switch (dial) {
    case 'dayCount':
      return 'Those days won’t fit at your other hard limits. Let the day count flex →';
    case 'saddle':
      return 'That saddle budget can’t be held for every day. Let the saddle budget flex →';
    case 'dark':
      return 'Getting in before dark every day isn’t possible on this route. Let in-before-dark flex →';
    case 'returnBy':
      return 'This route can’t make your return date. Let the return date flex →';
  }
}
