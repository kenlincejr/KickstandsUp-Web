// Pure route-leg editing core, extracted from RoutePlannerPage so one editor
// can author both a single-day route and a trip day. No React, no DOM.
import type { PlannerFuelPlan } from './planner-fuel-plan';
import type { PlaceSuggestion, PlannerWaypoint, ResolvedPlace, RouteDefinition, RoutePreview, SavedRevision } from './route-planner-repository';
import { routePointIdentity, type RoutePointDisplayIdentity } from './route-point-identity';

export type DraftPoint = Omit<PlannerWaypoint, 'latitude' | 'longitude' | 'source' | 'coordinateProvenance'> & {
  id: string;
  latitude?: number;
  longitude?: number;
  source?: PlannerWaypoint['source'];
  coordinateProvenance?: PlannerWaypoint['coordinateProvenance'];
};

export type RouteLegDraft = {
  points: DraftPoint[];
  title: string;
  avoidHighways: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
  routePlanId?: string;
  preview?: RoutePreview;
  previewStale: boolean;
  saved?: SavedRevision;
};

export function blankPoint(kind: DraftPoint['kind']): DraftPoint {
  return { id: crypto.randomUUID(), kind, displayName: '' };
}

export function createRouteLegDraft(initial?: Partial<RouteLegDraft>): RouteLegDraft {
  return {
    title: 'My next ride',
    points: [blankPoint('origin'), blankPoint('destination')],
    avoidHighways: false,
    avoidTolls: false,
    avoidFerries: false,
    previewStale: false,
    ...initial,
  };
}

export function insertIntermediatePoint(points: readonly DraftPoint[], point: DraftPoint): DraftPoint[] {
  return [...points.slice(0, -1), point, points.at(-1)!];
}

export function swapAdjacentPoint(points: readonly DraftPoint[], index: number, direction: -1 | 1): DraftPoint[] {
  const target = index + direction;
  if (index === 0 || index === points.length - 1 || target === 0 || target === points.length - 1) return [...points];
  const next = [...points];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function reorderPointList(points: readonly DraftPoint[], fromId: string, toId: string): DraftPoint[] {
  const fromIndex = points.findIndex((point) => point.id === fromId);
  const toIndex = points.findIndex((point) => point.id === toId);
  if (fromIndex <= 0 || toIndex <= 0 || fromIndex === points.length - 1 || toIndex === points.length - 1) return [...points];
  const next = [...points];
  const [moving] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moving);
  return next;
}

export function setIntermediatePointKind(points: readonly DraftPoint[], id: string, kind: 'stop' | 'via'): DraftPoint[] {
  return points.map((point) => point.id === id ? { ...point, kind } : point);
}

export function removePointById(points: readonly DraftPoint[], id: string): DraftPoint[] {
  return points.filter((point) => point.id !== id);
}

export function clearPointLocation(points: readonly DraftPoint[], id: string, displayName: string): DraftPoint[] {
  return points.map((point) => point.id === id ? {
    ...point, displayName, latitude: undefined, longitude: undefined, googlePlaceId: undefined, source: undefined, coordinateProvenance: undefined,
  } : point);
}

export function resolvePointToPlace(points: readonly DraftPoint[], id: string, place: ResolvedPlace): DraftPoint[] {
  return points.map((point) => point.id === id ? {
    ...point,
    displayName: place.address ? `${place.displayName} — ${place.address}` : place.displayName,
    latitude: place.latitude,
    longitude: place.longitude,
    googlePlaceId: place.placeId,
    source: 'google_place',
    coordinateProvenance: 'google_places',
  } : point);
}

export function movePointCoordinates(points: readonly DraftPoint[], id: string, { latitude, longitude }: { latitude: number; longitude: number }): DraftPoint[] {
  return points.map((point) => point.id === id ? {
    ...point, displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude,
    googlePlaceId: undefined, source: 'manual', coordinateProvenance: 'ksu_customer',
  } : point);
}

export function droppedPinLocation({ latitude, longitude }: { latitude: number; longitude: number }) {
  return { displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude, source: 'manual' as const, coordinateProvenance: 'ksu_customer' as const };
}

export function definitionFromDraft(draft: Pick<RouteLegDraft, 'points' | 'title' | 'avoidHighways' | 'avoidTolls' | 'avoidFerries'>, fuelPlan: PlannerFuelPlan | null): RouteDefinition | null {
  const resolved = draft.points.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.source && point.coordinateProvenance);
  if (!resolved) return null;
  return {
    title: draft.title.trim() || 'Untitled route',
    avoidHighways: draft.avoidHighways,
    avoidTolls: draft.avoidTolls,
    avoidFerries: draft.avoidFerries,
    ...(fuelPlan ? { fuelPlan } : {}),
    waypoints: draft.points.map(({ id: _id, ...point }) => point as PlannerWaypoint),
  };
}

export function previewMessageFor({ previewReady, previewStale, firstIncomplete }: {
  previewReady: boolean;
  previewStale: boolean;
  firstIncomplete: { identity: RoutePointDisplayIdentity } | null;
}) {
  return previewReady
    ? previewStale ? 'Route changed after preview. Preview the updated route before conditions or handoff.' : 'Every point is set. Preview the actual roads, then check conditions.'
    : firstIncomplete ? `${firstIncomplete.identity.token} needs a location. Search for it or place that exact point on the map.` : 'Add a start and finish to begin.';
}

export type RouteLegMapMarker = DraftPoint & RoutePointDisplayIdentity & { latitude: number; longitude: number; selected: boolean };

export function mapMarkersFor(points: readonly DraftPoint[], selectedPointId: string | null): RouteLegMapMarker[] {
  return points.flatMap((point, index) => typeof point.latitude === 'number' && typeof point.longitude === 'number'
    ? [{ ...point, latitude: point.latitude, longitude: point.longitude, ...routePointIdentity(points, index), selected: point.id === selectedPointId }]
    : []);
}

export type { PlaceSuggestion };
