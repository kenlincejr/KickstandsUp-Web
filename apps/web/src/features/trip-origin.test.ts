import { describe, expect, it } from 'vitest';
import { tripLegOrigin } from './trip-origin';

/**
 * SHARED DEVICE FIXTURE — keep byte-identical with
 * KickstandsUp/src/features/rides/__tests__/trip-origin-fixture.json and the
 * assertion in the device's trip-legs test. The same input array run through
 * this port and through the device's tripLegOrigin must produce the same
 * output, or the web shows one trip and the device navigates another.
 */
export const tripOriginFixture = {
  staging: { latitude: 30.2672, longitude: -97.7431 },
  legs: [
    { stops: [
      { kind: 'stop', latitude: 30.2672, longitude: -97.7431 },
      { kind: 'stop', latitude: 31.0982, longitude: -97.3428 },
      { kind: 'via', latitude: 31.5493, longitude: -97.1467 },
    ] },
    { stops: [] },
    { stops: [
      { kind: 'via', latitude: 34.2, longitude: -101.7 },
      { kind: 'stop', latitude: 35.2220, longitude: -101.8313 },
      { kind: 'via', latitude: 35.5, longitude: -102.0 },
    ] },
    { stops: [{ kind: 'stop', latitude: Number.NaN, longitude: -104.5 }] },
  ],
  expectedOrigins: [
    { latitude: 30.2672, longitude: -97.7431 },
    { latitude: 31.0982, longitude: -97.3428 },
    { latitude: 31.0982, longitude: -97.3428 },
    { latitude: 35.2220, longitude: -101.8313 },
    { latitude: 35.2220, longitude: -101.8313 },
  ],
} as const;

describe('tripLegOrigin (device-parity port)', () => {
  const legs = tripOriginFixture.legs.map((leg) => ({ stops: [...leg.stops] }));

  it('matches the shared device fixture at every index', () => {
    tripOriginFixture.expectedOrigins.forEach((expected, index) => {
      expect(tripLegOrigin(legs, index, tripOriginFixture.staging)).toEqual(expected);
    });
  });

  it('day 1 uses the staging pin', () => {
    expect(tripLegOrigin(legs, 0, tripOriginFixture.staging)).toEqual(tripOriginFixture.staging);
  });

  it('day 2 uses day 1’s last kind:stop, skipping the trailing via', () => {
    expect(tripLegOrigin(legs, 1, tripOriginFixture.staging)).toEqual({ latitude: 31.0982, longitude: -97.3428 });
  });

  it('an empty rest day does not reset the origin — it walks further back', () => {
    expect(tripLegOrigin(legs, 2, tripOriginFixture.staging)).toEqual({ latitude: 31.0982, longitude: -97.3428 });
  });

  it('a missing kind counts as stop', () => {
    const anonymous = [{ stops: [{ latitude: 40, longitude: -100 }] }, { stops: [] }];
    expect(tripLegOrigin(anonymous, 1, null)).toEqual({ latitude: 40, longitude: -100 });
  });

  it('a non-finite coordinate never seeds a morning', () => {
    expect(tripLegOrigin(legs, 4, tripOriginFixture.staging)).toEqual({ latitude: 35.2220, longitude: -101.8313 });
  });

  it('no prior stop anywhere → staging pin; no staging pin either → null', () => {
    const empty = [{ stops: [] }, { stops: [] }];
    expect(tripLegOrigin(empty, 1, tripOriginFixture.staging)).toEqual(tripOriginFixture.staging);
    expect(tripLegOrigin(empty, 1, null)).toBeNull();
  });
});
