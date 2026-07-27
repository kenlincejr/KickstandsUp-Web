import { describe, expect, it } from 'vitest';
import { riderCopyForTripError } from './trip-errors';

describe('riderCopyForTripError (§10.2 map)', () => {
  const rows: Array<[string, string, string]> = [
    ['28000', 'Sign in to plan a trip.', 'Your session expired'],
    ['42501', 'Planning a multi-day trip is a Premium feature.', 'part of Premium'],
    ['42501', 'Only the trip coordinator can plan these days.', 'created this trip'],
    ['22023', 'This ride is not a trip.', 'isn’t a multi-day trip'],
    ['22023', 'A trip needs a start date and a later end date.', 'end date has to be after'],
    ['22023', 'A trip can span up to 30 days.', 'up to 30 days'],
    ['22023', 'Send the trip days as an ordered list.', 'Reload the page'],
    ['22023', 'A trip needs at least one day.', 'at least one day'],
    ['22023', 'Day 3 is malformed.', 'Reload the page'],
    ['22023', 'Day 2 needs a departure time.', 'Day 2 needs a departure time'],
    ['22023', 'Trip days must run in order — day 4 starts before day 3.', 'Day 4 leaves before day 3'],
    ['22023', "Day 5 falls outside the trip's dates.", 'outside'],
    ['22023', "Day 2's stops are malformed.", 'Reload the page'],
    ['22023', 'A trip day can have up to 6 stops.', 'up to 6 stops or ride-throughs'],
    ['22023', 'That day is too detailed to save — try a shorter address or fewer stops.', 'too detailed to save'],
    ['22023', 'Every trip stop needs a stable id before it can be saved.', 'Reload the page'],
    ['22023', 'Two trip stops share the same id.', 'Reload the page'],
    ['22023', 'Every trip stop needs a name.', 'has no name'],
    ['22023', 'Every trip stop must be a stop or a ride-through.', 'Reload the page'],
    ['23514', 'new row violates check constraint "ride_trip_legs_booking_url_scheme"', 'http:// or https://'],
    ['23514', 'new row violates check constraint "rides_trip_span_check"', 'within 30 days'],
  ];

  // The departure-time row deliberately restates the server copy verbatim —
  // it is already rider-grade and the spec's own table keeps it.
  const deliberatelyVerbatim = new Set(['Day 2 needs a departure time.']);

  it.each(rows)('maps %s "%s"', (code, serverMessage, expected) => {
    const copy = riderCopyForTripError(code, serverMessage);
    expect(copy.message).toContain(expected);
    if (!deliberatelyVerbatim.has(serverMessage)) expect(copy.message).not.toBe(serverMessage);
  });

  it('extracts the day number so the editor can open the offending day', () => {
    expect(riderCopyForTripError('22023', 'Day 3 is malformed.').dayNumber).toBe(3);
    expect(riderCopyForTripError('22023', 'Trip days must run in order — day 4 starts before day 3.').dayNumber).toBe(4);
  });

  it('flags 55000 as terminal — no retry offered', () => {
    const copy = riderCopyForTripError('55000', 'This trip can no longer be edited.');
    expect(copy.terminal).toBe(true);
    expect(copy.message).toContain('locked');
  });

  it('flags the two identity errors as client bugs to log loudly', () => {
    expect(riderCopyForTripError('22023', 'Every trip stop needs a stable id before it can be saved.').clientBug).toBe(true);
    expect(riderCopyForTripError('22023', 'Two trip stops share the same id.').clientBug).toBe(true);
  });

  it('flags a create-time 42501 as contract drift', () => {
    expect(riderCopyForTripError('42501', 'Planning a multi-day trip is a Premium feature.').contractDrift).toBe(true);
  });

  it('an unmapped SQLSTATE falls back generic and never leaks the raw string', () => {
    const copy = riderCopyForTripError('XX000', 'internal: something scary at line 42');
    expect(copy.message).not.toContain('line 42');
    expect(copy.message).toContain('try Save again');
  });

  it('interpolates the trip date range when provided', () => {
    const copy = riderCopyForTripError('22023', "Day 5 falls outside the trip's dates.", { dateRangeLabel: 'Aug 1 – Aug 6' });
    expect(copy.message).toContain('Aug 1 – Aug 6');
  });
});
