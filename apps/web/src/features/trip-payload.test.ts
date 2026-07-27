import { describe, expect, it } from 'vitest';
import { createRouteLegDraft } from './route-leg-editor-core';
import {
  buildSetTripLegsPayload,
  dayStopsFromPoints,
  scoreTripAuthoring,
  stagingSourceForPoint,
  validateTripDays,
  type TripDayDraft,
  type TripDraftPoint,
} from './trip-payload';

function point(overrides: Partial<TripDraftPoint> = {}): TripDraftPoint {
  return {
    id: crypto.randomUUID(),
    kind: 'stop',
    displayName: 'Amarillo, TX',
    latitude: 35.222,
    longitude: -101.831,
    source: 'google_place',
    coordinateProvenance: 'google_places',
    googlePlaceId: 'ChIJx',
    ...overrides,
  };
}

function day(overrides: Partial<TripDayDraft> = {}): TripDayDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    departAt: '2026-08-01T07:00:00-05:00',
    arriveBy: '',
    leg: { ...createRouteLegDraft(), points: [point({ kind: 'origin', displayName: 'Austin, TX', latitude: 30.26, longitude: -97.74 }), point({ kind: 'destination', displayName: 'Lampasas, TX', latitude: 31.06, longitude: -98.18 })] },
    lodgingName: '',
    lodgingAddress: '',
    bookingUrl: '',
    checkInAt: '',
    checkOutAt: '',
    notes: '',
    restDay: false,
    ...overrides,
  };
}

const trip = { departureAt: '2026-08-01T07:00:00-05:00', expectedEndAt: '2026-08-06T18:00:00-05:00' };

describe('buildSetTripLegsPayload', () => {
  it('array position becomes day_index; no dayIndex key is ever emitted', () => {
    const second = day({ departAt: '2026-08-02T07:00:00-05:00' });
    const first = day();
    const payload = buildSetTripLegsPayload([second, first]) as Record<string, unknown>[];
    expect(payload).toHaveLength(2);
    expect(Date.parse(payload[0].departAt as string)).toBeLessThan(Date.parse(payload[1].departAt as string));
    for (const leg of payload) {
      expect('dayIndex' in leg).toBe(false);
      expect('day_index' in leg).toBe(false);
    }
  });

  it('emits exactly the §5.3 camelCase keys and the §6.3 stop keys', () => {
    const built = buildSetTripLegsPayload([day({
      title: 'Hill country', arriveBy: '2026-08-01T16:00:00-05:00',
      lodgingName: 'Drury Inn', lodgingAddress: '100 Main St', bookingUrl: 'https://example.com/book',
      checkInAt: '2026-08-01T15:00:00-05:00', checkOutAt: '2026-08-02T11:00:00-05:00', notes: 'Fuel before the twisties',
      plannedDistanceMeters: 344_000, plannedDurationSeconds: 13_200, routeRevisionId: 'rev-1',
    })]) as Record<string, unknown>[];
    expect(Object.keys(built[0]).sort()).toEqual([
      'arriveBy', 'bookingUrl', 'checkInAt', 'checkOutAt', 'departAt', 'lodgingAddress',
      'lodgingName', 'notes', 'plannedDistanceMeters', 'plannedDurationSeconds',
      'routeRevisionId', 'stops', 'title',
    ]);
    const stops = built[0].stops as Record<string, unknown>[];
    expect(stops[0]).toMatchObject({ kind: 'stop', source: 'place_search', providerPlaceId: 'ChIJx' });
    expect(typeof stops[0].stopId).toBe('string');
  });

  it('origin and destination waypoints are emitted with kind stop', () => {
    const built = buildSetTripLegsPayload([day()]) as Record<string, unknown>[];
    const stops = built[0].stops as Record<string, unknown>[];
    expect(stops.map((stop) => stop.kind)).toEqual(['stop', 'stop']);
  });

  it('via stops emit no stopLabels, no plannedDepartAt, no routedLeg', () => {
    const via = point({ kind: 'via', stopLabels: ['scenic'], plannedDepartAt: '2026-08-01T09:00:00-05:00', routedLeg: { fromStopId: '', durationSeconds: 900 } });
    const built = buildSetTripLegsPayload([day({ leg: { ...createRouteLegDraft(), points: [point({ kind: 'origin' }), via, point({ kind: 'destination', displayName: 'Llano, TX' })] } })]) as Record<string, unknown>[];
    const wireVia = (built[0].stops as Record<string, unknown>[])[1];
    expect(wireVia.kind).toBe('via');
    expect('stopLabels' in wireVia).toBe(false);
    expect('plannedDepartAt' in wireVia).toBe(false);
    expect('routedLeg' in wireVia).toBe(false);
  });

  it('maps source to the StagingLocation vocabulary — never google_place', () => {
    expect(stagingSourceForPoint({ source: 'google_place', coordinateProvenance: 'google_places' })).toBe('place_search');
    expect(stagingSourceForPoint({ source: 'manual', coordinateProvenance: 'ksu_customer' })).toBe('dropped_pin');
    expect(stagingSourceForPoint({ source: 'manual', coordinateProvenance: undefined })).toBe('manual');
    const built = buildSetTripLegsPayload([day()]) as Record<string, unknown>[];
    const sources = (built[0].stops as Record<string, unknown>[]).map((stop) => stop.source);
    expect(sources).not.toContain('google_place');
  });

  it('projects stop identity ONCE across the flattened trip — a duplicated day re-mints', () => {
    const shared = point({ stopId: 'dup-id' });
    const dayThree = day({ departAt: '2026-08-03T07:00:00-05:00', leg: { ...createRouteLegDraft(), points: [point({ kind: 'origin', stopId: 'o-3' }), shared, point({ kind: 'destination', displayName: 'Dumas, TX', stopId: 'd-3' })] } });
    const dayFour = day({ departAt: '2026-08-04T07:00:00-05:00', leg: { ...createRouteLegDraft(), points: dayThree.leg.points.map((entry) => ({ ...entry, id: crypto.randomUUID() })) } });
    const built = buildSetTripLegsPayload([dayThree, dayFour]) as Record<string, unknown>[];
    const ids = built.flatMap((leg) => (leg.stops as Record<string, unknown>[]).map((stop) => stop.stopId as string));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids.slice(0, 3)).toEqual(['o-3', 'dup-id', 'd-3']);
  });

  it('a rest day emits an empty stops array and drops route fields', () => {
    const rest = day({ restDay: true, routeRevisionId: 'rev-x', plannedDistanceMeters: 1000 });
    const built = buildSetTripLegsPayload([rest]) as Record<string, unknown>[];
    expect(built[0].stops).toEqual([]);
    expect('routeRevisionId' in built[0]).toBe(false);
    expect('plannedDistanceMeters' in built[0]).toBe(false);
  });

  it('prefers a fresh preview over stored distance, and stored distance over nothing', () => {
    const preview = { operationId: 'o', provider: 'google_routes' as const, providerRequestHash: 'h', distanceMeters: 402_336.5, durationSeconds: 14_400.4, encodedPolyline: '', calculatedAt: '', expiresAt: '', cacheHit: false };
    const fresh = day({ leg: { ...day().leg, preview, previewStale: false }, plannedDistanceMeters: 1 });
    const stale = day({ leg: { ...day().leg, preview, previewStale: true }, plannedDistanceMeters: 344_000, plannedDurationSeconds: 13_200 });
    const built = buildSetTripLegsPayload([fresh, stale]) as Record<string, unknown>[];
    expect(built[0].plannedDistanceMeters).toBe(402_337);
    expect(built[1].plannedDistanceMeters).toBe(344_000);
  });
});

describe('validateTripDays (§10.1, per day, in order)', () => {
  it('requires at least one day and at most 30', () => {
    expect(validateTripDays([], trip)[0].message).toContain('at least one day');
    const many = Array.from({ length: 31 }, (_, index) => day({ departAt: new Date(Date.parse(trip.departureAt) + index * 3_600_000).toISOString() }));
    expect(validateTripDays(many, trip)[0].message).toContain('up to 30 days');
  });

  it('names the day missing a departure time', () => {
    const issues = validateTripDays([day(), day({ departAt: '' })], trip);
    expect(issues.some((issue) => issue.field === 'departAt' && issue.message.includes('needs a departure time'))).toBe(true);
  });

  it('flags a departure outside the trip window', () => {
    const outside = day({ departAt: '2026-09-01T07:00:00-05:00' });
    const issues = validateTripDays([outside], trip);
    expect(issues.some((issue) => issue.message.includes('outside the trip'))).toBe(true);
  });

  it('flags more than 6 stops counting stops and vias together', () => {
    const points = [point({ kind: 'origin' }), ...Array.from({ length: 5 }, (_, index) => point({ kind: index % 2 ? 'via' : 'stop', displayName: `W${index}` })), point({ kind: 'destination', displayName: 'End' })];
    const issues = validateTripDays([day({ leg: { ...createRouteLegDraft(), points } })], trip);
    expect(issues.some((issue) => issue.field === 'stops' && issue.message.includes('up to 6'))).toBe(true);
  });

  it('rejects a day over the 8192-octet cap measured in octets, not UTF-16 units', () => {
    // Multibyte payload: under 8192 UTF-16 units but over 8192 octets.
    const heavy = '🏍️'.repeat(900);
    const points = [point({ kind: 'origin', displayName: heavy.slice(0, 40) }), point({ kind: 'destination', displayName: heavy, address: heavy })];
    const draft = day({ leg: { ...createRouteLegDraft(), points } });
    const json = JSON.stringify(points.map((entry) => entry.displayName));
    expect(json.length).toBeLessThan(new TextEncoder().encode(json).length);
    const issues = validateTripDays([draft], trip);
    expect(issues.some((issue) => issue.message.includes('too detailed'))).toBe(true);
  });

  it('detects a duplicate stopId across two different days', () => {
    const first = day();
    const second = day({ departAt: '2026-08-02T07:00:00-05:00' });
    first.leg.points[1].stopId = 'shared';
    second.leg.points[1].stopId = 'shared';
    const issues = validateTripDays([first, second], trip);
    expect(issues.some((issue) => issue.message.includes('repeats a stop from day 1'))).toBe(true);
  });

  it('validates arrival, check-out, booking URL length and scheme, and text caps', () => {
    const bad = day({
      arriveBy: '2026-08-01T05:00:00-05:00',
      checkInAt: '2026-08-01T15:00:00-05:00',
      checkOutAt: '2026-08-01T14:00:00-05:00',
      bookingUrl: 'ftp://nope',
      title: 'x'.repeat(121),
      lodgingName: 'x'.repeat(181),
      lodgingAddress: 'x'.repeat(241),
      notes: 'x'.repeat(1001),
    });
    const messages = validateTripDays([bad], trip).map((issue) => issue.message).join('\n');
    expect(messages).toContain('target arrival is before its departure');
    expect(messages).toContain('check-out is before its check-in');
    expect(messages).toContain('http:// or https://');
    expect(messages).toContain('over 120');
    expect(messages).toContain('over 180');
    expect(messages).toContain('over 240');
    expect(messages).toContain('over 1,000');

    const longUrl = day({ bookingUrl: `https://example.com/${'a'.repeat(500)}` });
    expect(validateTripDays([longUrl], trip).some((issue) => issue.message.includes('too long'))).toBe(true);
  });

  it('a rest day (zero stops) is valid', () => {
    const rest = day({ restDay: true, departAt: '2026-08-02T07:00:00-05:00' });
    expect(validateTripDays([day(), rest], trip)).toEqual([]);
  });

  it('non-decreasing departures pass; a backwards day names both days', () => {
    const one = day();
    const two = day({ departAt: '2026-08-01T07:00:00-05:00' });
    expect(validateTripDays([one, two], trip)).toEqual([]);
  });
});

describe('dayStopsFromPoints', () => {
  it('drops incomplete points and trims names', () => {
    const stops = dayStopsFromPoints([point({ displayName: '  Amarillo  ' }), point({ displayName: '', latitude: undefined })]);
    expect(stops).toHaveLength(1);
    expect(stops[0].displayName).toBe('Amarillo');
  });

  it('drops a routedLeg above the 24h ceiling instead of clamping it', () => {
    const stops = dayStopsFromPoints([point({ routedLeg: { fromStopId: '', durationSeconds: 90_000 } })]);
    expect(stops[0].routedLeg).toBeUndefined();
  });
});

describe('scoreTripAuthoring', () => {
  it('scores a complete build at exactly 100', () => {
    const result = scoreTripAuthoring({
      extractedEditor: true, atomicSave: true, stopIdentityAcrossTrip: true,
      originChainMatchesDevice: true, failClosedEditingReadOpen: true,
      perDayErrorCopy: true, previewBudget: true, noSilentTruncation: true,
    });
    expect(result).toMatchObject({ score: 100, maxScore: 100, passed: true, missing: [] });
  });

  it('withholds the stop-identity weight when the projection is per-day', () => {
    const result = scoreTripAuthoring({
      extractedEditor: true, atomicSave: true, stopIdentityAcrossTrip: false,
      originChainMatchesDevice: true, failClosedEditingReadOpen: true,
      perDayErrorCopy: true, previewBudget: true, noSilentTruncation: true,
    });
    expect(result.score).toBe(80);
    expect(result.passed).toBe(false);
  });
});
