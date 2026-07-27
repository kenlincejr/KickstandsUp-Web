// A small, generic first-run "coach mark": a dismissible chip/callout with a
// short line of copy and a "Got it" button, shown once per browser and
// dismissed forever. This generalizes the pattern already proven by
// `planner-onboarding.ts` (route-planner guide, localStorage-persisted,
// non-blocking) and mirrors the installed app's `PlannerCoachMark`
// (`src/features/routes/planner-coach-marks.tsx`) — same one-time,
// dismiss-forever model, same versioned key suffix so copy changes can force
// a re-show later if ever needed.
//
// `planner-onboarding.ts` is left untouched here (it belongs to another
// in-flight change on this repo) — this module does not replace it, it is
// the shared primitive a future pass could point that file at.
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../design/day-kit';

const STORAGE_PREFIX = 'ksu.web.coachMark.';
const DISMISSED_VALUE = 'seen';

/** `ksu.web.coachMark.<kind>.<version>` — matches the device's
 * `ksu.routePlanner.coachMark.<kind>.v1` convention. */
export function coachMarkStorageKey(kind: string, version = 'v1'): string {
  return `${STORAGE_PREFIX}${kind}.${version}`;
}

/** Pure predicate, same shape as `shouldShowPlannerGuide` — kept separate
 * from the storage read so it's trivially testable without a DOM. */
export function shouldShowCoachMark(storageValue: string | null): boolean {
  return storageValue !== DISMISSED_VALUE;
}

/** Reads localStorage defensively: private browsing, quota exhaustion, or a
 * disabled storage API must never throw past this point. A read failure is
 * treated as "not yet dismissed" — the mark just shows, and dismissal falls
 * back to per-session only (see `dismissCoachMark`). */
export function readCoachMarkDismissed(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Best-effort persistence. Swallows any storage error so a full quota or a
 * blocked storage API never breaks the page — the mark simply reappears next
 * load, which is the same degraded behavior the device gives when
 * AsyncStorage fails. */
export function writeCoachMarkDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, DISMISSED_VALUE);
  } catch {
    // Private browsing / quota / storage disabled — dismissal stays
    // per-session only via the caller's in-memory state.
  }
}

export type CoachMarkProps = {
  /** Full storage key, e.g. `coachMarkStorageKey('trip-day-editor')`. */
  storageKey: string;
  children: ReactNode;
  dismissLabel?: string;
  className?: string;
};

/** A one-time, dismiss-forever teaching chip. Never a blocking modal, never a
 * multi-step carousel — one line of copy and a "Got it". */
export function CoachMark({ storageKey, children, dismissLabel = 'Got it', className }: CoachMarkProps) {
  const [visible, setVisible] = useState(() => shouldShowCoachMark(readCoachMarkDismissed(storageKey)));

  // Re-check on key change (e.g. a version bump swaps which key this mark
  // watches) rather than only on mount.
  useEffect(() => {
    setVisible(shouldShowCoachMark(readCoachMarkDismissed(storageKey)));
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = (event: React.MouseEvent<HTMLButtonElement>) => {
    writeCoachMarkDismissed(storageKey);
    // This was never a focus trap (it's a plain button reached by normal tab
    // order, not a modal), so once the mark unmounts the browser's default of
    // returning focus to <body> is the sane outcome — blur explicitly rather
    // than leaving a reference to a about-to-vanish node.
    event.currentTarget.blur();
    setVisible(false);
  };

  return (
    <div className={['ksu-coach-mark', className].filter(Boolean).join(' ')} role="note">
      <p className="ksu-coach-mark-copy">{children}</p>
      <Button className="ksu-coach-mark-dismiss" onClick={dismiss} variant="text">
        {dismissLabel}
      </Button>
    </div>
  );
}
