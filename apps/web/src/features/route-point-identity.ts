export type RoutePointKind = 'origin' | 'stop' | 'via' | 'destination';

export type RoutePointLike = {
  id: string;
  kind: RoutePointKind;
  displayName: string;
  latitude?: number;
  longitude?: number;
};

export type RoutePointDisplayIdentity = {
  token: 'S' | 'F' | `W${number}`;
  name: 'Start' | 'Finish' | `W${number}`;
  purpose: 'Start' | 'Finish' | 'Stop here' | 'Ride through';
};

export function routePointIdentity(points: readonly RoutePointLike[], index: number): RoutePointDisplayIdentity {
  const point = points[index];
  if (!point) throw new Error('Route point index is outside the itinerary.');
  if (index === 0 || point.kind === 'origin') return { token: 'S', name: 'Start', purpose: 'Start' };
  if (index === points.length - 1 || point.kind === 'destination') return { token: 'F', name: 'Finish', purpose: 'Finish' };
  const token = `W${index}` as const;
  return { token, name: token, purpose: point.kind === 'stop' ? 'Stop here' : 'Ride through' };
}

export function isRoutePointComplete(point: RoutePointLike) {
  return point.displayName.trim().length > 0 && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

export function firstIncompletePoint(points: readonly RoutePointLike[]) {
  const index = points.findIndex((point) => !isRoutePointComplete(point));
  return index < 0 ? null : { index, point: points[index], identity: routePointIdentity(points, index) };
}

export function placeExistingRoutePoint<T extends RoutePointLike>(points: readonly T[], pointId: string, location: Pick<T, 'displayName' | 'latitude' | 'longitude'>): T[] {
  let found = false;
  const next = points.map((point) => {
    if (point.id !== pointId) return point;
    found = true;
    return { ...point, ...location };
  });
  return found ? next : [...points];
}

export type PlannerDesignScore = {
  score: number;
  maxScore: 100;
  passed: boolean;
  missing: string[];
};

/** A deterministic acceptance score for the Phase 0 rider-trust criteria. */
export function scorePlannerDesign(criteria: {
  stableIdentity: boolean;
  targetedPlacement: boolean;
  mapListSelection: boolean;
  stalePreviewProtection: boolean;
  localRecovery: boolean;
  keyboardRecovery: boolean;
}) : PlannerDesignScore {
  const checks: Array<[keyof typeof criteria, string, number]> = [
    ['stableIdentity', 'stable S/Wn/F identity', 20],
    ['targetedPlacement', 'targeted empty-point placement', 20],
    ['mapListSelection', 'map and itinerary selection sync', 15],
    ['stalePreviewProtection', 'stale-preview protection', 20],
    ['localRecovery', 'row-local recovery actions', 15],
    ['keyboardRecovery', 'keyboard recovery controls', 10],
  ];
  const missing = checks.filter(([key]) => !criteria[key]).map(([, label]) => label);
  return { score: checks.filter(([key]) => criteria[key]).reduce((total, [, , value]) => total + value, 0), maxScore: 100, passed: missing.length === 0, missing };
}
