import { afterEach, describe, expect, it } from 'vitest';
import { coachMarkStorageKey, readCoachMarkDismissed, shouldShowCoachMark, writeCoachMarkDismissed } from './coach-marks';

// This suite runs without jsdom (see vite.config.ts — plain node), so there is
// no real `window`/`localStorage` here. That is deliberately exercised below:
// the "no window" case IS the storage-unavailable fallback path in
// production (private browsing, a locked-down webview, etc.), and a minimal
// fake `window` is installed only for the round-trip test.

describe('coach mark storage key', () => {
  it('follows the device convention: ksu.<surface>.coachMark.<kind>.<version>', () => {
    expect(coachMarkStorageKey('trip-day-editor')).toBe('ksu.web.coachMark.trip-day-editor.v1');
  });

  it('versions independently per kind so a copy change can force a re-show', () => {
    expect(coachMarkStorageKey('trip-day-editor', 'v2')).toBe('ksu.web.coachMark.trip-day-editor.v2');
    expect(coachMarkStorageKey('trip-day-editor', 'v2')).not.toBe(coachMarkStorageKey('trip-day-editor', 'v1'));
  });
});

describe('shouldShowCoachMark', () => {
  it('shows until this browser has dismissed it', () => {
    expect(shouldShowCoachMark(null)).toBe(true);
    expect(shouldShowCoachMark('seen')).toBe(false);
  });

  it('treats any other stored value as not-yet-dismissed rather than guessing', () => {
    expect(shouldShowCoachMark('dismissed')).toBe(true);
    expect(shouldShowCoachMark('')).toBe(true);
  });
});

describe('storage-unavailable fallback (no window in this test environment)', () => {
  it('a missing storage API reads as "never dismissed" instead of throwing', () => {
    const key = coachMarkStorageKey('storage-unavailable-read');
    expect(() => readCoachMarkDismissed(key)).not.toThrow();
    expect(readCoachMarkDismissed(key)).toBeNull();
    expect(shouldShowCoachMark(readCoachMarkDismissed(key))).toBe(true);
  });

  it('a missing storage API swallows the write — the mark just falls back to per-session', () => {
    const key = coachMarkStorageKey('storage-unavailable-write');
    expect(() => writeCoachMarkDismissed(key)).not.toThrow();
  });
});

describe('dismissal persistence (with a fake localStorage installed)', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('round-trips a dismissal through a working storage backend', () => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
      },
    };
    const key = coachMarkStorageKey('round-trip-test');
    expect(shouldShowCoachMark(readCoachMarkDismissed(key))).toBe(true);
    writeCoachMarkDismissed(key);
    expect(shouldShowCoachMark(readCoachMarkDismissed(key))).toBe(false);
  });

  it('a storage backend that throws on access degrades the same as no storage at all', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => { throw new Error('SecurityError: storage disabled'); },
        setItem: () => { throw new Error('QuotaExceededError'); },
      },
    };
    const key = coachMarkStorageKey('round-trip-throwing');
    expect(() => readCoachMarkDismissed(key)).not.toThrow();
    expect(readCoachMarkDismissed(key)).toBeNull();
    expect(() => writeCoachMarkDismissed(key)).not.toThrow();
  });
});
