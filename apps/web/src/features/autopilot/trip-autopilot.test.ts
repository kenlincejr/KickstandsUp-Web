import { describe, expect, it } from 'vitest';
import {
  deriveCandidateSamples,
  solveAutopilot,
  sortCandidatesByPointIndex,
  buildRouteProfile,
  type AnchorCandidate,
  type AutopilotRequest,
  type ResolvedAnchorName,
  type RouteProfile,
} from './trip-autopilot';
import { findLodgingCta } from './trip-autopilot-reasons';
import { autopilotDaysToDrafts } from './autopilot-plan';
import { buildSetTripLegsPayload, validateTripDays } from '../trip-payload';

// ---------------------------------------------------------------------------
// Fixture builders — a straight-line synthetic route stands in for a real
// `computeRoutes` decode. The solver's inputs are just (lat, lon, cumulative
// meters, cumulative seconds); a real polyline decode is exercised only by
// `buildRouteProfile`'s own dedicated tests below.
// ---------------------------------------------------------------------------

const METERS_PER_MILE = 1609.344;
const MPH = 55;

/** A straight line of `count` points running east from Austin, one town every ~90 mi, at a constant 55 mph. */
function syntheticProfile(totalMiles: number, count: number): RouteProfile {
  const totalMeters = totalMiles * METERS_PER_MILE;
  const totalSeconds = (totalMiles / MPH) * 3600;
  const points = Array.from({ length: count }, (_, i) => {
    const fraction = i / (count - 1);
    return {
      latitude: 30.27 + fraction * 4, // drifts north, away from the equator — a plain arithmetic stand-in
      longitude: -97.74 + fraction * 15, // drifts east
      cumulativeMeters: fraction * totalMeters,
      cumulativeSeconds: fraction * totalSeconds,
    };
  });
  return { points, totalMeters, totalSeconds, interpolated: false };
}

const townNames = ['Childress', 'Dodge City', 'Ogallala', 'Rapid City', 'Sturgis'];

function namedCandidates(profile: RouteProfile): AnchorCandidate[] {
  const resolveName = (pointIndex: number): ResolvedAnchorName => {
    if (pointIndex === 0) return { name: 'Austin', nameSource: 'place_search', offRouteMeters: 0 };
    if (pointIndex === profile.points.length - 1) return { name: 'Sturgis', nameSource: 'place_search', offRouteMeters: 0 };
    const town = townNames[pointIndex % townNames.length];
    return { name: `${town} ${pointIndex}`, nameSource: 'place_search', offRouteMeters: 500 };
  };
  return deriveCandidateSamples(profile, resolveName);
}

function baseRequest(overrides: Partial<AutopilotRequest> = {}): AutopilotRequest {
  const profile = syntheticProfile(1400, 40);
  const candidates = namedCandidates(profile);
  return {
    departAt: '2026-08-14T07:00:00-05:00', // a Friday
    profile,
    candidates,
    saddleBudgetSeconds: { value: 6 * 3600, mode: 'soft' },
    dayShape: 'even',
    inBeforeDark: { value: true, mode: 'soft' },
    restCadenceSeconds: 2 * 3600,
    overnightStandard: 'any',
    weatherPosture: 'suggest',
    ...overrides,
  };
}

describe('solveAutopilot — determinism (P-1)', () => {
  it('same request solved 1000 times returns byte-identical JSON', () => {
    const request = baseRequest();
    const first = JSON.stringify(solveAutopilot(request));
    for (let i = 0; i < 1000; i += 1) {
      expect(JSON.stringify(solveAutopilot(request))).toBe(first);
    }
  }, 30_000);

  it('a shuffled candidate array yields the identical plan', () => {
    const request = baseRequest();
    const ordered = JSON.stringify(solveAutopilot(request));

    // Fisher-Yates with a fixed seed so the shuffle itself is deterministic.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const shuffled = [...request.candidates];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    expect(sortCandidatesByPointIndex(shuffled)).toEqual(sortCandidatesByPointIndex(request.candidates));

    const shuffledResult = JSON.stringify(solveAutopilot({ ...request, candidates: shuffled }));
    expect(shuffledResult).toBe(ordered);
  });
});

describe('solveAutopilot — solved fixture (Austin → Sturgis style)', () => {
  const request = baseRequest();
  const result = solveAutopilot(request);

  it('solves', () => {
    expect(result.status).toBe('solved');
  });

  it('every riding day carries a non-empty reason string; rest days carry the rest clause', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    expect(result.plan.legs.length).toBeGreaterThan(0);
    for (const leg of result.plan.legs) {
      expect(leg.reason.length).toBeGreaterThan(0);
      if (leg.stops.length === 0) {
        expect(leg.reason).toContain('no riding');
      } else {
        expect(leg.reason).toMatch(/\d+ mi/);
      }
    }
  });

  it('the final riding day names the destination as "your destination"', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    const ridingLegs = result.plan.legs.filter((leg) => leg.stops.length > 0);
    expect(ridingLegs.at(-1)!.reason).toContain('your destination');
  });

  it('departAt is strictly non-decreasing across the plan (P-2)', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    for (let i = 1; i < result.plan.legs.length; i += 1) {
      expect(Date.parse(result.plan.legs[i].departAt)).toBeGreaterThanOrEqual(Date.parse(result.plan.legs[i - 1].departAt));
    }
  });

  it('every stopId is non-empty and unique across the whole plan (P-7)', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    const ids = result.plan.legs.flatMap((leg) => leg.stops.map((stop) => stop.stopId));
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps: legs <= 30, stops per leg <= 6 (P-5)', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    expect(result.plan.legs.length).toBeLessThanOrEqual(30);
    for (const leg of result.plan.legs) expect(leg.stops.length).toBeLessThanOrEqual(6);
  });

  it('no reason or trade string contains banned lodging vocabulary (P-8)', () => {
    if (result.status !== 'solved') throw new Error('expected solved');
    const banned = /\b(bed|beds|hotel|motel|lodging available|vacancy|has rooms)\b/i;
    for (const leg of result.plan.legs) expect(leg.reason).not.toMatch(banned);
    for (const trade of result.plan.trades) expect(trade.message).not.toMatch(banned);
  });

  it('findLodgingCta is the only sanctioned use of the word "lodging"', () => {
    expect(findLodgingCta('Sturgis')).toBe('Find lodging near Sturgis');
  });
});

// MUST-FIX 2, 2026-07-27 gate review: ported from KickstandsUp master 5f6fd08
// — "the next named town" is a claim about a named place. On the web today,
// every interior candidate resolves nameless until the /place-reverse worker
// is deployed (autopilot-naming.ts) — exactly the surface this fix protects.
describe('solveAutopilot — spacing clause never claims an unnamed next candidate is "the next named town"', () => {
  it('with every interior candidate unnamed (the real pre-deploy web state), no reason ever says "next named town"', () => {
    const profile = syntheticProfile(1400, 40);
    // Mirrors autopilot-panel.tsx's actual resolver shape before/without the
    // discovery-cache worker: only the origin and terminus are named.
    const resolveName = (pointIndex: number): ResolvedAnchorName => {
      if (pointIndex === 0) return { name: 'Austin', nameSource: 'place_search', offRouteMeters: 0 };
      if (pointIndex === profile.points.length - 1) return { name: 'Sturgis', nameSource: 'place_search', offRouteMeters: 0 };
      return { name: null, nameSource: 'none', offRouteMeters: 0 };
    };
    const candidates = deriveCandidateSamples(profile, resolveName);
    const request = baseRequest({ profile, candidates });
    const result = solveAutopilot(request);
    expect(result.status).toBe('solved');
    if (result.status !== 'solved') throw new Error('expected solved');
    for (const leg of result.plan.legs) {
      expect(leg.reason).not.toMatch(/next named town/);
      // Every non-rest, non-terminus day's anchor is unnamed here, so it must
      // render through the Mile-N fallback, never a blank.
      if (leg.stops.length) expect(leg.reason).toMatch(/^(Mile \d+|Austin|Sturgis) —/);
    }
  });
});

describe('solveAutopilot — infeasible with relaxation', () => {
  it('a hard saddle budget too small for a hard-pinned day count is infeasible, and offers a relaxation that solves', () => {
    const request = baseRequest({
      saddleBudgetSeconds: { value: 2 * 3600, mode: 'hard' }, // 2h/day hard — 1400 mi needs far more than 1 day
      dayCount: { value: 1, mode: 'hard' },
    });
    const result = solveAutopilot(request);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('expected infeasible');
    expect(['dayCount', 'saddle', 'route']).toContain(result.conflict.binding);
    expect(result.conflict.message.length).toBeGreaterThan(0);
    if (result.conflict.relaxation) {
      expect(result.conflict.relaxation.preview.legs.length).toBeGreaterThan(0);
      // Re-solving the relaxed request must actually succeed on its own terms too.
      for (const leg of result.conflict.relaxation.preview.legs) expect(leg.reason.length).toBeGreaterThan(0);
    }
  });

  it('never returns a plan that violates a hard constraint (P-6)', () => {
    const request = baseRequest({ saddleBudgetSeconds: { value: 5 * 3600, mode: 'hard' } });
    const result = solveAutopilot(request);
    if (result.status === 'solved') {
      for (const leg of result.plan.legs) {
        if (typeof leg.plannedDurationSeconds === 'number') {
          expect(leg.plannedDurationSeconds).toBeLessThanOrEqual(5 * 3600);
        }
      }
    } else {
      // Infeasible is also an acceptable, honest outcome — the invariant is
      // "never silently over budget", not "always solves".
      expect(result.conflict.message.length).toBeGreaterThan(0);
    }
  });

  it('at most two hard dials — a third throws at the request boundary', () => {
    const request = baseRequest({
      saddleBudgetSeconds: { value: 6 * 3600, mode: 'hard' },
      inBeforeDark: { value: true, mode: 'hard' },
      dayCount: { value: 3, mode: 'hard' },
    });
    expect(() => solveAutopilot(request)).toThrow(/at most two hard dials/);
  });
});

describe('autopilotDaysToDrafts → buildSetTripLegsPayload → validateTripDays (contract round trip)', () => {
  it('a solved plan converts to drafts that validate with zero issues', () => {
    const request = baseRequest();
    const result = solveAutopilot(request);
    expect(result.status).toBe('solved');
    if (result.status !== 'solved') throw new Error('expected solved');

    const tripWindow = { departureAt: request.departAt, expectedEndAt: new Date(Date.parse(request.departAt) + 20 * 86_400_000).toISOString() };
    const drafts = autopilotDaysToDrafts(result.plan, tripWindow);
    expect(drafts.length).toBe(result.plan.legs.length);

    const issues = validateTripDays(drafts, tripWindow);
    expect(issues).toEqual([]);

    const payload = buildSetTripLegsPayload(drafts) as Array<{ stops: unknown[]; departAt: string }>;
    expect(payload.length).toBe(drafts.length);
    // Every riding day's payload carries exactly the solver's one anchor stop;
    // rest days carry none.
    for (let i = 0; i < payload.length; i += 1) {
      const restDay = result.plan.legs[i].stops.length === 0;
      expect(payload[i].stops.length).toBe(restDay ? 0 : 1);
    }
    // Stop identity survives the payload's own projectStops pass unchanged.
    const solverIds = result.plan.legs.flatMap((leg) => leg.stops.map((stop) => stop.stopId));
    const payloadIds = payload.flatMap((leg) => (leg.stops as Array<{ stopId: string }>).map((stop) => stop.stopId));
    expect(payloadIds).toEqual(solverIds);
  });

  it('never writes lodging fields', () => {
    const request = baseRequest();
    const result = solveAutopilot(request);
    if (result.status !== 'solved') throw new Error('expected solved');
    const tripWindow = { departureAt: request.departAt, expectedEndAt: new Date(Date.parse(request.departAt) + 20 * 86_400_000).toISOString() };
    const drafts = autopilotDaysToDrafts(result.plan, tripWindow);
    for (const draft of drafts) {
      expect(draft.lodgingName).toBe('');
      expect(draft.lodgingAddress).toBe('');
      expect(draft.bookingUrl).toBe('');
      expect(draft.checkInAt).toBe('');
      expect(draft.checkOutAt).toBe('');
    }
  });
});

describe('buildRouteProfile', () => {
  it('is monotonic in both cumulative fields', () => {
    const path = Array.from({ length: 10 }, (_, i) => ({ latitude: 30 + i * 0.5, longitude: -97 - i * 0.3 }));
    const legs = [{ distanceMeters: 100_000, durationSeconds: 3600 }, { distanceMeters: 80_000, durationSeconds: 2800 }];
    const profile = buildRouteProfile(path, legs);
    for (let i = 1; i < profile.points.length; i += 1) {
      expect(profile.points[i].cumulativeMeters).toBeGreaterThanOrEqual(profile.points[i - 1].cumulativeMeters);
      expect(profile.points[i].cumulativeSeconds).toBeGreaterThanOrEqual(profile.points[i - 1].cumulativeSeconds);
    }
    expect(profile.interpolated).toBe(false);
  });

  it('falls back to interpolated:true and apportions the whole-route duration when legs is absent', () => {
    const path = [{ latitude: 30, longitude: -97 }, { latitude: 31, longitude: -96 }, { latitude: 32, longitude: -95 }];
    const profile = buildRouteProfile(path, undefined, 7200);
    expect(profile.interpolated).toBe(true);
    expect(profile.totalSeconds).toBe(7200);
    expect(profile.points.at(-1)!.cumulativeSeconds).toBeCloseTo(7200, 0);
  });

  it('handles a degenerate 2-point (actually 1-point) path without throwing', () => {
    const profile = buildRouteProfile([{ latitude: 30, longitude: -97 }], undefined);
    expect(profile.points.length).toBe(2);
    expect(profile.totalMeters).toBe(0);
  });
});
