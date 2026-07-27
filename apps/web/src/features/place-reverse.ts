// Single-point reverse geocoding for a dropped map pin.
//
// The app names a dropped pin the moment it lands (`describeDroppedPin`,
// KickstandsUp src/features/routes/route-planner-screen.tsx:570-579) so a rider
// sees "Cooper's BBQ" rather than "31.06400, -98.18100". This is the web half
// of that, pointed at the SAME keyless Photon proxy the Autopilot anchor namer
// already uses (`autopilot/autopilot-naming.ts`) — one endpoint, one shared
// rate limiter, no second reverse-geocode path and no new billed surface.
//
// Endpoint verified LIVE 2026-07-27 (it 404'd earlier the same day; the owner
// deployed the worker in between). Still fail-soft on every path — a rate-limit
// 429, a network drop, or a future redeploy gap must leave the pin wearing its
// coordinate label rather than blocking placement or throwing.
//
// Response shape, confirmed against the live worker rather than assumed:
//   {"results":[{"osmId":"W736963775","name":"Cadence Bank",
//                "address":"101 East 9th Street, Lampasas, Texas, 76550",
//                "locality":"East 9th Street, Lampasas",
//                "latitude":31.06,"longitude":-98.18}]}
// Note `address`/`locality` — NOT city/state. An earlier draft of this file
// parsed city/state, which silently produced a bare name and dropped the
// address entirely.
import { DISCOVERY_WORKER_BASE_URL } from './autopilot/autopilot-naming';

/** Matches the Autopilot namer's per-request ceiling. A single pin is one call. */
const REVERSE_TIMEOUT_MS = 8_000;

type ReverseResult = { name?: string; address?: string; locality?: string } | undefined;

/**
 * Turn one worker result into a pin label, or null if there is nothing worth
 * showing. Pure, so the shape contract above is pinned by a test rather than
 * only by a comment.
 *
 * `name — address` matches how a searched place is labelled
 * (`resolvePointToPlace`), so a dropped pin and a searched stop read the same
 * in the itinerary. Falls back through address, then locality: a street and
 * town still beats a coordinate pair, so a miss on the POI name is not a miss.
 */
export function placeReverseLabel(result: { name?: string; address?: string; locality?: string } | undefined): string | null {
  if (!result) return null;
  const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
  const name = clean(result.name);
  const address = clean(result.address);
  const locality = clean(result.locality);
  if (name && address) return `${name} — ${address}`;
  return name || address || locality || null;
}

/**
 * Best-effort name for one coordinate. Resolves to null on ANY failure — a
 * 404 if the worker is ever rolled back, 429 over the shared IP ceiling,
 * network error, abort, malformed body — so callers can treat "no name" as the
 * normal, expected outcome.
 */
export async function describeDroppedPin(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const timeout = AbortSignal.timeout(REVERSE_TIMEOUT_MS);
    const url = `${DISCOVERY_WORKER_BASE_URL}/place-reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { results?: ReverseResult[] } | null;
    return placeReverseLabel(body?.results?.[0]);
  } catch {
    return null;
  }
}
