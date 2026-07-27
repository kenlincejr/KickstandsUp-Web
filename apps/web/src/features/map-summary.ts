// The one-line "what have I built so far" summary shown over the map.
//
// Ported from the device's itinerary bar (KickstandsUp
// src/features/routes/route-focus.ts:32-48) so a rider crossing between the
// phone and rideksu.com reads the same sentence in the same order. Pure — no
// React, no DOM, so both the planner and the trip-day editor can share it and
// a test can pin the copy.

export type MapSummaryInput = {
  /** Every editor point, placed or not. */
  pointCount: number;
  /** Points that actually have coordinates — an unplaced blank is not progress. */
  placedCount: number;
  distanceMeters?: number;
  durationSeconds?: number;
  /** A preview exists but the route changed under it. */
  previewStale: boolean;
  /** A preview request is in flight right now. */
  routing: boolean;
};

/** Whole miles, matching the device's rounding. */
function miles(meters: number): string {
  return `${Math.round(meters / 1609.344)} mi`;
}

/** "1h 1m" / "48m" — the device's saddle-time shape, never "0h 48m". */
function saddle(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The bar's text. Degrades honestly rather than showing a stale number as if
 * it were current: a route edited after its preview says "not updated", and one
 * mid-request says "routing…", exactly as the device does.
 */
export function mapSummaryLine({ pointCount, placedCount, distanceMeters, durationSeconds, previewStale, routing }: MapSummaryInput): string {
  if (placedCount === 0) return 'Choose Start, then click the map to begin';

  const parts = [`Itinerary · ${pointCount} ${pointCount === 1 ? 'point' : 'points'}`];
  const measured = typeof distanceMeters === 'number' && typeof durationSeconds === 'number';

  // Distance and time come from a landed preview only. Showing the numbers
  // while they are stale would state a distance the current route does not have.
  if (measured && !previewStale) parts.push(miles(distanceMeters), saddle(durationSeconds));

  if (routing) parts.push('routing…');
  else if (previewStale) parts.push('not updated');
  else if (!measured) parts.push('preview for distance');

  return parts.join(' · ');
}
