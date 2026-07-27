import { describe, expect, it } from 'vitest';
import { createRouteLegDraft } from './route-leg-editor-core';
import { buildSetTripLegsPayload, type TripDayDraft, type TripDraftPoint } from './trip-payload';
import {
  parseTrip,
  tripDayCount,
  tripDayHeading,
  tripLegBookingUrl,
  tripLegDistanceLabel,
  tripLegOvernightLabel,
  tripLegRouteLabel,
  tripTotalMiles,
} from './trip-repository';

const wireStop = (name: string, stopId: string, kind: 'stop' | 'via' = 'stop') => ({
  displayName: name, address: '', latitude: 35.2, longitude: -101.8, source: 'place_search', kind, stopId,
});

const payload = {
  rideId: 'ride-1',
  departureAt: '2026-08-01T07:00:00-05:00',
  expectedEndAt: '2026-08-06T18:00:00-05:00',
  legs: [
    { id: 'leg-2', dayIndex: 1, departAt: '2026-08-02T07:00:00-05:00', stops: [wireStop('Dumas, TX', 's3')], lodgingName: 'Rodeway Inn', checkInAt: '2026-08-02T15:00:00-05:00' },
    { id: 'leg-1', dayIndex: 0, departAt: '2026-08-01T07:00:00-05:00', title: 'Shakedown day', arriveBy: '2026-08-01T16:00:00-05:00', plannedDistanceMeters: 344_000, plannedDurationSeconds: 13_200, routeRevisionId: 'rev-1', stops: [wireStop('Austin, TX', 's1'), wireStop('Palo Duro', 's-via', 'via'), wireStop('Amarillo, TX', 's2')], bookingUrl: 'https://example.com/book', notes: 'Fuel early' },
  ],
};

describe('parseTrip (device parity)', () => {
  it('returns null without rideId / departureAt / expectedEndAt', () => {
    expect(parseTrip(null)).toBeNull();
    expect(parseTrip({ rideId: 'x', departureAt: 'not a date', expectedEndAt: payload.expectedEndAt })).toBeNull();
    expect(parseTrip({ ...payload, rideId: undefined })).toBeNull();
  });

  it('drops legs missing id / departAt / dayIndex, not the whole trip', () => {
    const parsed = parseTrip({ ...payload, legs: [...payload.legs, { id: 'leg-3', departAt: undefined, dayIndex: 2 }, { title: 'no id' }] });
    expect(parsed?.legs).toHaveLength(2);
  });

  it('re-sorts legs by dayIndex client-side', () => {
    const parsed = parseTrip(payload);
    expect(parsed?.legs.map((leg) => leg.id)).toEqual(['leg-1', 'leg-2']);
  });

  it('round-trip stability: a parse → rebuild keeps every stopId byte-identical', () => {
    const parsed = parseTrip(payload)!;
    const days: TripDayDraft[] = parsed.legs.map((leg) => ({
      id: leg.id,
      legId: leg.id,
      title: leg.title ?? '',
      departAt: leg.departAt,
      arriveBy: leg.arriveBy ?? '',
      leg: {
        ...createRouteLegDraft(),
        points: leg.stops.map((stop, index): TripDraftPoint => ({
          id: `${leg.id}-${index}`,
          kind: stop.kind === 'via' ? 'via' : 'stop',
          displayName: stop.displayName,
          latitude: stop.latitude,
          longitude: stop.longitude,
          source: stop.source === 'place_search' ? 'google_place' : 'manual',
          coordinateProvenance: stop.source === 'place_search' ? 'google_places' : 'ksu_customer',
          googlePlaceId: stop.providerPlaceId,
          stopId: stop.stopId,
          address: stop.address,
          locality: stop.locality,
          stopLabels: stop.stopLabels,
          plannedDepartAt: stop.plannedDepartAt,
          routedLeg: stop.routedLeg,
        })),
      },
      routeRevisionId: leg.routeRevisionId,
      plannedDistanceMeters: leg.plannedDistanceMeters,
      plannedDurationSeconds: leg.plannedDurationSeconds,
      lodgingName: leg.lodgingName ?? '',
      lodgingAddress: leg.lodgingAddress ?? '',
      bookingUrl: leg.bookingUrl ?? '',
      checkInAt: leg.checkInAt ?? '',
      checkOutAt: leg.checkOutAt ?? '',
      notes: leg.notes ?? '',
      restDay: leg.stops.length === 0,
    }));
    const rebuilt = buildSetTripLegsPayload(days) as Record<string, unknown>[];
    const rebuiltIds = rebuilt.flatMap((leg) => (leg.stops as Record<string, unknown>[]).map((stop) => stop.stopId));
    expect(rebuiltIds).toEqual(['s1', 's-via', 's2', 's3']);
    expect(rebuilt[0].routeRevisionId).toBe('rev-1');
    expect(rebuilt[0].plannedDistanceMeters).toBe(344_000);
  });

  it('tripDayCount prefers legs and falls back to the date span for a zero-leg trip', () => {
    const parsed = parseTrip(payload)!;
    expect(tripDayCount(parsed)).toBe(2);
    const empty = parseTrip({ ...payload, legs: [] })!;
    expect(tripDayCount(empty)).toBe(6);
  });
});

describe('label helpers (device parity)', () => {
  const parsed = parseTrip(payload)!;
  const dayOne = parsed.legs[0];

  it('route label joins stops with arrows and skips vias', () => {
    expect(tripLegRouteLabel(dayOne)).toBe('Austin, TX → Amarillo, TX');
    expect(tripLegRouteLabel({ ...dayOne, stops: [] })).toBeNull();
  });

  it('distance label renders miles and hours like the device', () => {
    expect(tripLegDistanceLabel(dayOne)).toBe('214 mi · 3h 40m');
    expect(tripLegDistanceLabel({ ...dayOne, plannedDistanceMeters: undefined, plannedDurationSeconds: undefined })).toBeNull();
    expect(tripTotalMiles(parsed.legs)).toBe(214);
  });

  it('overnight label needs a lodging name; heading names the day', () => {
    expect(tripLegOvernightLabel(dayOne)).toBeNull();
    expect(tripLegOvernightLabel(parsed.legs[1], 'America/Chicago')).toBe('Rodeway Inn · check-in 3:00 PM');
    expect(tripDayHeading(parsed.legs[1], 'America/Chicago')).toBe('DAY 2 · Sun, Aug 2');
  });

  it('booking URL is scheme-checked, never trusted', () => {
    expect(tripLegBookingUrl(dayOne)).toBe('https://example.com/book');
    expect(tripLegBookingUrl({ ...dayOne, bookingUrl: 'javascript:alert(1)' })).toBeNull();
    expect(tripLegBookingUrl({ ...dayOne, bookingUrl: 'https://a b.com' })).toBeNull();
  });
});
