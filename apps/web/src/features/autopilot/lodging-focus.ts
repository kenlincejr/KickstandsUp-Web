// Pure guard extracted from trip-editor-page.tsx's pending-lodging-focus
// effect (gate review 2026-07-27, MUST-FIX 1 — P0 infinite update loop).
//
// THE CYCLE, traced: the effect used to re-run on every `days` change and
// never cleared `pendingLodgingFocus`. `openDayEditor` called
// `editor.replaceDraft` with a brand-new object unconditionally — even when
// the target day was already the open one — which changed `editor.draft`,
// which a SEPARATE mirror effect wrote back into `days` as a new array/object
// reference (`setDays((current) => current.map(...))`), which changed `days`
// again, which re-ran THIS effect (still holding the same unclear
// `pendingLodgingFocus`) → `openDayEditor` → `replaceDraft` → ... unbounded.
//
// Fixed two ways, both required: (a) the effect now clears
// `pendingLodgingFocus` immediately after the first successful open — see
// `shouldOpenPendingLodgingFocus` below, called once then never again for
// that request; (b) `openDayEditor` itself now bails when the target day is
// already `openDayId`, so even a caller that forgets to one-shot can never
// re-point the editor at a day that's already open.
export type PendingLodgingFocus = { dayId: string; placeName: string } | null;

/**
 * Should the pending lodging-focus request open its target day right now?
 * True exactly once: the day has to exist in `days` (it lands there
 * asynchronously, via the SAME `setDays` call that accepted the Autopilot
 * plan) and the request has to still be pending. The caller is responsible
 * for clearing `pendingLodgingFocus` the moment this returns true — that is
 * what makes the request "pending" only until its first successful open.
 */
export function shouldOpenPendingLodgingFocus(days: readonly { id: string }[], pending: PendingLodgingFocus): boolean {
  if (!pending) return false;
  return days.some((day) => day.id === pending.dayId);
}
