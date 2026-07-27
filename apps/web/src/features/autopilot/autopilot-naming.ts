// The free anchor-naming resolver (trip-autopilot-spec-2026-07-26 §3.2b),
// wired up per the 2026-07-27 gate review MUST-FIX 3. Device-side companion:
// KickstandsUp master 9c6d789 added GET /place-reverse to the discovery-cache
// Worker — a keyless Photon /reverse proxy, same IP rate limiter, edge cache,
// and never-block posture as the existing /place-search endpoint this repo
// already calls (route-planner-repository.ts).
//
// DEPLOY-GATED: the endpoint exists in the worker's source tree but has not
// been deployed by the owner yet — every call 404s until it is. That is by
// design (§3 / D-3: no paid or new-surface call ships silently); every
// caller here treats ANY failure (404 today, 429 over the rate ceiling,
// network error, malformed body) identically — fall back to name:null, which
// renders as the solver's own "Mile N" fallback. This resolver must never
// throw and must never block the panel.
import type { AnchorNameSource, ResolvedAnchorName } from './trip-autopilot';

/** Keyless egress for the discovery-cache Worker — public by design (this is
 *  the PUBLIC ksu-web repo; there is no secret here to protect). */
export const DISCOVERY_WORKER_BASE_URL = 'https://discovery.rideksu.com';

/** The worker shares ONE ip-keyed limiter (`place:ip:<ip>`) across
 *  /place-search and /place-reverse at 40 requests / 10s (device repo
 *  workers/discovery-cache/src/index.ts). A single Autopilot naming pass
 *  must stay comfortably under that on its own — capped well short of the
 *  ceiling so it never crowds out the destination search the rider is also
 *  using in the same panel. */
export const MAX_REVERSE_LOOKUPS = 30;
export const REVERSE_LOOKUP_CONCURRENCY = 4;

/**
 * Thin an index list down to at most `max` entries, evenly spaced, always
 * keeping the first and last. Pure — this is the "widen the stride" the gate
 * review asked for, applied AFTER sampling rather than by touching the
 * solver's own `SAMPLE_STRIDE_METERS`/`MAX_CANDIDATES` constants (§4.5),
 * which are shared, tested, byte-parity-locked solver internals this repo
 * must not fork.
 */
export function pickEvenSubset<T>(items: readonly T[], max: number): T[] {
  if (max <= 0 || items.length === 0) return [];
  if (items.length <= max) return [...items];
  if (max === 1) return [items[0]];
  const picked: T[] = [];
  for (let k = 0; k < max; k += 1) {
    picked.push(items[Math.round((k * (items.length - 1)) / (max - 1))]);
  }
  // Rounding can collide adjacent picks on a short, unevenly-divisible list —
  // de-dup by reference/value equality via a Set is wrong for objects, so
  // instead de-dup by the caller's own index identity is unnecessary here
  // because `items` are already unique point indices; a defensive uniq pass
  // keeps the contract ("at most max, evenly spaced") honest either way.
  return Array.from(new Set(picked));
}

type ReverseGeocodeResult = { name?: string; latitude?: number; longitude?: number } | undefined;

async function fetchOne(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `${DISCOVERY_WORKER_BASE_URL}/place-reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return null; // 404 pre-deploy, 429 over ceiling, 5xx — all fall back identically
    const body = (await response.json().catch(() => null)) as { results?: ReverseGeocodeResult[] } | null;
    const first = body?.results?.[0];
    const name = first && typeof first.name === 'string' ? first.name.trim() : '';
    return name.length ? name : null;
  } catch {
    // Network failure, abort, malformed JSON — never throw out of this
    // function. The panel must never block or error on naming.
    return null;
  }
}

/**
 * Resolve names for up to `MAX_REVERSE_LOOKUPS` of the given points, in
 * batches of `REVERSE_LOOKUP_CONCURRENCY` concurrent requests. Points beyond
 * the cap are left unresolved (the caller's own `resolveName` fallback
 * renders them as `Mile N`) — this IS the throttle the gate review asked
 * for: fewer network calls on a long route rather than exceeding the shared
 * IP ceiling.
 */
export async function resolveInteriorNames(
  points: readonly { pointIndex: number; latitude: number; longitude: number }[],
  signal?: AbortSignal,
): Promise<Map<number, ResolvedAnchorName>> {
  const resolved = new Map<number, ResolvedAnchorName>();
  const throttled = pickEvenSubset(points, MAX_REVERSE_LOOKUPS);

  for (let start = 0; start < throttled.length; start += REVERSE_LOOKUP_CONCURRENCY) {
    const batch = throttled.slice(start, start + REVERSE_LOOKUP_CONCURRENCY);
    const names = await Promise.all(batch.map((point) => fetchOne(point.latitude, point.longitude, signal)));
    batch.forEach((point, i) => {
      const name = names[i];
      const nameSource: AnchorNameSource = name ? 'reverse_geocode' : 'none';
      resolved.set(point.pointIndex, { name, nameSource, offRouteMeters: 0 });
    });
  }

  return resolved;
}
