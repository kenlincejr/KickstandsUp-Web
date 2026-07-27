/**
 * Minimal pure helpers ported from the device repo (KickstandsUp) so
 * trip-autopilot.ts (this folder) never depends on device-only modules
 * (`@/features/maps/leg-estimate`, `@/features/routes/fuel-plan`, which pull
 * in `@/features/rider-trust/contracts` and RN-adjacent types that don't
 * exist here). Only the two functions trip-autopilot.ts actually calls are
 * ported — `haversineMiles` and `buildFuelPlan` — kept semantically
 * identical to their sources.
 *
 * Source: C:\KickstandsUp\src\features\maps\leg-estimate.ts (haversineMiles)
 * Source: C:\KickstandsUp\src\features\routes\fuel-plan.ts (buildFuelPlan)
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

/** Great-circle distance between two points, in miles. */
export function haversineMiles(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type FuelPlan = {
  rangeMiles: number;
  reservePercent: number;
  reserveMiles: number;
  stopMiles: number[];
};

export const DEFAULT_FUEL_RESERVE_PERCENT = 20;

export function buildFuelPlan(distanceMeters: number, rangeMiles: number | null | undefined, reservePercent = DEFAULT_FUEL_RESERVE_PERCENT): FuelPlan | null {
  const routeMiles = distanceMeters / 1609.344;
  if (!Number.isFinite(routeMiles) || routeMiles <= 0 || !Number.isFinite(rangeMiles) || !rangeMiles || rangeMiles < 40) return null;
  const normalizedReservePercent = Math.max(5, Math.min(50, Math.round(reservePercent)));
  const reserveMiles = Math.max(5, Math.round(rangeMiles * normalizedReservePercent / 100));
  const interval = rangeMiles - reserveMiles;
  if (routeMiles <= interval) return { rangeMiles, reservePercent: normalizedReservePercent, reserveMiles, stopMiles: [] };
  const stopMiles: number[] = [];
  for (let mile = interval; mile < routeMiles; mile += interval) stopMiles.push(Math.round(mile));
  return { rangeMiles, reservePercent: normalizedReservePercent, reserveMiles, stopMiles };
}
