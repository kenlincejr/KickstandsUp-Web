import { describe, expect, it } from 'vitest';
import { shouldOpenPendingLodgingFocus } from './lodging-focus';

describe('shouldOpenPendingLodgingFocus (P0 infinite-loop guard, gate review 2026-07-27)', () => {
  it('false when nothing is pending', () => {
    expect(shouldOpenPendingLodgingFocus([{ id: 'a' }], null)).toBe(false);
  });

  it('false while the target day has not landed in days yet', () => {
    expect(shouldOpenPendingLodgingFocus([{ id: 'a' }], { dayId: 'b', placeName: 'Sturgis' })).toBe(false);
  });

  it('true once the target day exists', () => {
    expect(shouldOpenPendingLodgingFocus([{ id: 'a' }, { id: 'b' }], { dayId: 'b', placeName: 'Sturgis' })).toBe(true);
  });

  it('stays true on a second call with the SAME pending value — the caller (not this predicate) is what must one-shot it', () => {
    const days = [{ id: 'b' }];
    const pending = { dayId: 'b', placeName: 'Sturgis' };
    expect(shouldOpenPendingLodgingFocus(days, pending)).toBe(true);
    // Proves this pure function alone cannot prevent the loop — pairing it
    // with "clear pending after the first true" at the call site is required.
    expect(shouldOpenPendingLodgingFocus(days, pending)).toBe(true);
  });
});
