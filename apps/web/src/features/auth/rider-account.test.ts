import { describe, expect, it } from 'vitest';
import { riderAccountStateFromProbe } from './rider-account';

describe('rider-account state', () => {
  it('treats a profile row as an existing rider', () => {
    expect(riderAccountStateFromProbe({ data: { id: 'u1', display_name: 'Ken' }, error: null }))
      .toEqual({ status: 'ready', displayName: 'Ken' });
  });

  it('treats a missing profile row as setup-required, not as an error', () => {
    expect(riderAccountStateFromProbe({ data: null, error: null })).toEqual({ status: 'setup-required' });
  });

  it('never reports a failed probe as a missing account', () => {
    // The load-bearing case. An existing rider on a flaky connection must not be
    // told to go create an account in the app — that costs a real sign-in and
    // reads as "KSU lost my account".
    const state = riderAccountStateFromProbe({ data: null, error: { message: 'network error' } });

    expect(state.status).toBe('unavailable');
    expect(state.status).not.toBe('setup-required');
    expect(state).toEqual({ status: 'unavailable', message: 'network error' });
  });

  it('keeps an existing rider signed in even when the row carries no display name', () => {
    // Presence of the row is the test, not the completeness of its columns —
    // requiring a name could lock out a rider whose profile predates it.
    expect(riderAccountStateFromProbe({ data: { id: 'u1', display_name: null }, error: null }))
      .toEqual({ status: 'ready', displayName: null });
  });
});
