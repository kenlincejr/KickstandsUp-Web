// Single-point reverse geocoding for a dropped map pin.
//
// The app names a dropped pin the moment it lands (`describeDroppedPin`,
// KickstandsUp src/features/routes/route-planner-screen.tsx:570-579) so a rider
// sees "Cooper's BBQ" rather than "31.06400, -98.18100". This is the web half
// of that, pointed at the SAME keyless Photon proxy the Autopilot anchor namer
// already uses (`autopilot/autopilot-naming.ts`) — one endpoint, one shared
// rate limiter, no second reverse-geocode path and no new billed surface.
//
// ⚠️ DEPLOY-GATED, verified 404 on 2026-07-27. `/place-reverse` exists in the
// discovery-cache Worker's source tree (KickstandsUp master 9c6d789) but has
// not been deployed. Every call 404s until the owner runs the worker deploy.
// That is the whole reason this resolver is fail-soft: pre-deploy it returns
// null and the pin keeps its coordinate label, which is exactly today's
// behavior. Post-deploy the same code starts producing real names with no
// client change. It must never throw and never block placement.
import { DISCOVERY_WORKER_BASE_URL } from './autopilot/autopilot-naming';

/** Matches the Autopilot namer's per-request ceiling. A single pin is one call. */
const REVERSE_TIMEOUT_MS = 8_000;

type ReverseResult = { name?: string; city?: string; state?: string } | undefined;

/**
 * Best-effort name for one coordinate. Resolves to null on ANY failure — 404
 * pre-deploy, 429 over the shared IP ceiling, network error, abort, malformed
 * body — so callers can treat "no name" as the normal, expected outcome.
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
    const first = body?.results?.[0];
    if (!first) return null;
    const name = typeof first.name === 'string' ? first.name.trim() : '';
    // A bare town name is still far better than a coordinate pair, so fall
    // through to city/state rather than requiring a POI hit.
    const locality = [first.city, first.state].filter((part) => typeof part === 'string' && part.trim()).join(', ');
    if (name && locality) return `${name} — ${locality}`;
    return name || locality || null;
  } catch {
    return null;
  }
}
