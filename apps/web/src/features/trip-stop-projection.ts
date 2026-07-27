// Web port of KickstandsUp/src/features/rides/stop-projection.ts — semantics
// preserved exactly, locked by trip-stop-projection.test.ts. This is a copy,
// not a shared package: ksu-web has no build-time dependency on the private
// repo, and packages/contracts is a mirror, not a source of backend truth.
// If the device projection changes, this file changes with it or trips break.

export type StagingLocationSource = 'manual' | 'google_maps_link' | 'current_location' | 'dropped_pin' | 'place_search';

export type StopLabel = 'gas' | 'food' | 'scenic' | 'meetup' | 'break';

export type StagingLocation = {
  displayName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  locality?: string;
  providerPlaceId?: string;
  source: StagingLocationSource;
  kind?: 'stop' | 'via';
  stopLabels?: StopLabel[];
  stopId?: string;
  plannedDepartAt?: string;
  routedLeg?: { fromStopId: string; durationSeconds: number };
};

/** A stop carrying the stable identity every join/checkpoint/ETA surface pins to. */
export type ProjectedStop = StagingLocation & { stopId: string };

const stopLabels: StopLabel[] = ['gas', 'food', 'scenic', 'meetup', 'break'];

export function isStagingLocationSource(value: unknown): value is StagingLocationSource {
  return value === 'manual' || value === 'google_maps_link' || value === 'current_location' || value === 'dropped_pin' || value === 'place_search';
}

function isStopLabel(value: unknown): value is StopLabel {
  return stopLabels.includes(value as StopLabel);
}

/**
 * crypto.randomUUID when available, else a hand-rolled v4. The fallback
 * matters in a browser: randomUUID is absent on non-secure origins, and an
 * undefined stopId is a save that fails with a server error the leader
 * cannot act on.
 */
export function createStopId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Give every stop in an ordered plan a stable identity.
 * - An existing stopId is PRESERVED (a rider's meet point pins to the place,
 *   not the array position).
 * - A duplicate id is re-minted — set_trip_legs rejects trip-wide duplicates
 *   because ride_participants.join_at_stop_id is ride-scoped.
 * - Object identity is preserved for stops that already had a usable id, so
 *   re-projecting on every render does not churn React state.
 *
 * For a TRIP: run this ONCE across the flattened whole trip, never per day.
 * A per-day pass cannot see the cross-day collision a duplicated day creates.
 */
export function projectStops(stops: readonly StagingLocation[]): ProjectedStop[] {
  const taken = new Set<string>();
  return stops.map((stop) => {
    if (stop.stopId && !taken.has(stop.stopId)) {
      taken.add(stop.stopId);
      return stop as ProjectedStop;
    }
    let minted = createStopId();
    while (taken.has(minted)) minted = createStopId();
    taken.add(minted);
    return { ...stop, stopId: minted };
  });
}

/**
 * The parser's upper bound on a stored routedLeg duration: one absurd value
 * would push a computed arrival past the ECMAScript date range and
 * white-screen the device ride screen.
 */
export const MAX_ROUTED_LEG_SECONDS = 24 * 60 * 60;

function parseRoutedLeg(value: unknown): StagingLocation['routedLeg'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { fromStopId, durationSeconds } = value as { fromStopId?: unknown; durationSeconds?: unknown };
  if (typeof fromStopId !== 'string') return undefined;
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return undefined;
  if (durationSeconds > MAX_ROUTED_LEG_SECONDS) return undefined;
  return { fromStopId, durationSeconds };
}

/**
 * Parse an ordered stop plan off the wire (a trip leg's `stops`). Identity is
 * NOT assigned here — callers run the result through projectStops.
 * Mirrors the device parser field for field: unknown labels are dropped, a
 * via never carries labels / plannedDepartAt / routedLeg, a nameless stop is
 * dropped, and a non-finite coordinate never survives.
 */
export function parseStagingLocations(value: unknown): StagingLocation[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const waypoints = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => {
      const kind = entry.kind === 'via' ? ('via' as const) : ('stop' as const);
      const labels = kind !== 'via' && Array.isArray(entry.stopLabels) ? entry.stopLabels.filter(isStopLabel) : [];
      return {
        displayName: typeof entry.displayName === 'string' ? entry.displayName : '',
        address: typeof entry.address === 'string' ? entry.address : '',
        latitude: Number.isFinite(entry.latitude) ? entry.latitude as number : undefined,
        longitude: Number.isFinite(entry.longitude) ? entry.longitude as number : undefined,
        locality: typeof entry.locality === 'string' ? entry.locality : undefined,
        providerPlaceId: typeof entry.providerPlaceId === 'string' ? entry.providerPlaceId : undefined,
        source: isStagingLocationSource(entry.source) ? entry.source : 'manual' as const,
        kind,
        stopLabels: labels.length ? labels : undefined,
        stopId: typeof entry.stopId === 'string' && entry.stopId ? entry.stopId : undefined,
        plannedDepartAt: kind !== 'via' && typeof entry.plannedDepartAt === 'string' && entry.plannedDepartAt ? entry.plannedDepartAt : undefined,
        routedLeg: kind !== 'via' ? parseRoutedLeg(entry.routedLeg) : undefined,
      } satisfies StagingLocation;
    })
    .filter((waypoint) => waypoint.displayName.trim().length > 0);
  return waypoints.length ? waypoints : undefined;
}
