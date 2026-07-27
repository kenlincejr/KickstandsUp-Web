import { describe, expect, it } from 'vitest';
import { tripCreateReady, tripCreateSteps } from './trip-create-readiness';

const complete = {
  hasStaging: true,
  startIso: '2026-08-01T07:00:00-05:00',
  endIso: '2026-08-06T18:00:00-05:00',
  datesValid: true,
  title: 'Austin → Sturgis',
};

describe('trip create readiness', () => {
  it('is ready only when staging, dates and a name are all set', () => {
    expect(tripCreateReady(tripCreateSteps(complete))).toBe(true);
    expect(tripCreateReady(tripCreateSteps({ ...complete, hasStaging: false }))).toBe(false);
    expect(tripCreateReady(tripCreateSteps({ ...complete, title: '   ' }))).toBe(false);
    expect(tripCreateReady(tripCreateSteps({ ...complete, startIso: null }))).toBe(false);
    expect(tripCreateReady(tripCreateSteps({ ...complete, datesValid: false }))).toBe(false);
  });

  it('reports the steps in the order the panel presents them', () => {
    expect(tripCreateSteps(complete).map((step) => step.id)).toEqual(['staging', 'dates', 'name']);
  });

  it('distinguishes missing dates from an invalid range', () => {
    // "Pick dates" is useless to a rider who already picked two.
    const missing = tripCreateSteps({ ...complete, startIso: null, endIso: null, datesValid: false });
    expect(missing[1].todo).toBe('Pick when you roll out and when you’re back.');

    const badRange = tripCreateSteps({ ...complete, datesValid: false });
    expect(badRange[1].todo).toBe('End after the start, within 30 days.');
  });

  it('treats a whitespace-only name as missing', () => {
    expect(tripCreateSteps({ ...complete, title: '\t \n' })[2].done).toBe(false);
  });
});
