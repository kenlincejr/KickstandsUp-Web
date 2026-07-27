// React state/effects for one route-leg editor instance. Extracted from
// RoutePlannerPage so the trip editor can mount one per day. All route logic
// lives in route-leg-editor-core.ts; this hook owns async effects and identity.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  blankPoint,
  clearPointLocation,
  createRouteLegDraft,
  definitionFromDraft,
  droppedPinLocation,
  insertIntermediatePoint,
  movePointCoordinates,
  previewMessageFor,
  removePointById,
  reorderPointList,
  resolvePointToPlace,
  setIntermediatePointKind,
  swapAdjacentPoint,
  type DraftPoint,
  type RouteLegDraft,
} from './route-leg-editor-core';
import { firstIncompletePoint, placeExistingRoutePoint } from './route-point-identity';
import type { PlannerFuelPlan } from './planner-fuel-plan';
import {
  isCompleteDefinition,
  previewRoute,
  resolvePlace,
  saveRoute,
  searchPlaces,
  type PlaceSuggestion,
  type RouteDefinition,
} from './route-planner-repository';

export type RouteLegEditorBusy = 'preview' | 'save' | 'place' | null;

export type UseRouteLegEditorOptions = {
  initial?: Partial<RouteLegDraft>;
  maxPoints: number;
  fuelPlan: PlannerFuelPlan | null;
  instanceId: string;
  /** Fires on any draft mutation, including preview/save results landing. */
  onChange?: () => void;
  /** Fires only when the rider edits route content (points, title, avoidances). */
  onEdited?: () => void;
};

export function useRouteLegEditor({ initial, maxPoints, fuelPlan, instanceId, onChange, onEdited }: UseRouteLegEditorOptions) {
  const [draft, setDraft] = useState<RouteLegDraft>(() => createRouteLegDraft(initial));
  const [busy, setBusy] = useState<RouteLegEditorBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingPointId, setSearchingPointId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [activePlacementPointId, setActivePlacementPointId] = useState<string | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  // Google Places session tokens are per autocomplete-then-details sequence and
  // per editor instance; sharing one across day editors misbills the account.
  const placeSession = useRef(crypto.randomUUID());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEditedRef = useRef(onEdited);
  onEditedRef.current = onEdited;

  const definition = useMemo<RouteDefinition | null>(
    () => definitionFromDraft(draft, fuelPlan),
    [draft, fuelPlan],
  );

  const firstIncomplete = firstIncompletePoint(draft.points);
  const previewReady = Boolean(definition && isCompleteDefinition(definition));
  const freshPreview = Boolean(draft.preview && !draft.previewStale);
  const previewMessage = previewMessageFor({ previewReady, previewStale: draft.previewStale, firstIncomplete });

  const markChanged = () => {
    setDraft((current) => ({ ...current, previewStale: Boolean(current.preview), saved: undefined }));
    setError(null);
    setHint(null);
    onEditedRef.current?.();
    onChangeRef.current?.();
  };

  const setPoints = (mutate: (points: readonly DraftPoint[]) => DraftPoint[]) => {
    setDraft((current) => ({ ...current, points: mutate(current.points) }));
  };

  const activeSearch = draft.points.find((point) => point.id === searchingPointId);

  useEffect(() => {
    if (!activeSearch || activeSearch.displayName.trim().length < 3 || activeSearch.googlePlaceId) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(activeSearch.displayName.trim(), placeSession.current, controller.signal)
        .then(setSuggestions)
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Place search is unavailable.');
        });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeSearch?.displayName, activeSearch?.googlePlaceId, activeSearch?.id]);

  useEffect(() => {
    if (!searchingPointId) return;
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(`.stop-editor[data-editor-instance="${instanceId}"]`)) {
        setSearchingPointId(null);
        setSuggestions([]);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSearchingPointId(null); setSuggestions([]); }
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeIfOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [searchingPointId, instanceId]);

  const selectPoint = (pointId: string) => {
    setSelectedPointId(pointId);
    window.requestAnimationFrame(() => document.getElementById(`route-point-${instanceId}-${pointId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const updatePointQuery = (id: string, displayName: string) => {
    markChanged();
    setSearchingPointId(id);
    setSelectedPointId(id);
    setActivePlacementPointId(null);
    setSuggestions([]);
    setPoints((current) => clearPointLocation(current, id, displayName));
  };

  const choosePlace = async (pointId: string, suggestion: PlaceSuggestion) => {
    setBusy('place');
    setError(null);
    setHint(null);
    try {
      const place = await resolvePlace(suggestion.placeId, placeSession.current);
      setPoints((current) => resolvePointToPlace(current, pointId, place));
      setSearchingPointId(null);
      setActivePlacementPointId(null);
      setSelectedPointId(pointId);
      setSuggestions([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not use that place.');
    } finally {
      setBusy(null);
    }
  };

  const addIntermediate = (kind: 'stop' | 'via') => {
    markChanged();
    const point = blankPoint(kind);
    setSearchingPointId(point.id);
    setSelectedPointId(point.id);
    setActivePlacementPointId(point.id);
    setSuggestions([]);
    setPoints((current) => insertIntermediatePoint(current, point));
  };

  const addMapPoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!activePlacementPointId) {
      setError('Choose a route point first, then use “Place on map.” KSU will never add an unplanned waypoint from a map click.');
      return;
    }
    markChanged();
    setSearchingPointId(null);
    setSuggestions([]);
    setPoints((current) => placeExistingRoutePoint(current, activePlacementPointId, droppedPinLocation({ latitude, longitude })));
    setSelectedPointId(activePlacementPointId);
    setActivePlacementPointId(null);
  };

  const moveMapPoint = (id: string, coordinates: { latitude: number; longitude: number }) => {
    markChanged();
    setPoints((current) => movePointCoordinates(current, id, coordinates));
    setSelectedPointId(id);
  };

  const movePoint = (index: number, direction: -1 | 1) => {
    if (index === 0 || index === draft.points.length - 1) return;
    const target = index + direction;
    if (target === 0 || target === draft.points.length - 1) return;
    markChanged();
    setPoints((current) => swapAdjacentPoint(current, index, direction));
  };

  const reorderWaypoint = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    markChanged();
    setPoints((current) => reorderPointList(current, fromId, toId));
  };

  const setIntermediateKind = (id: string, kind: 'stop' | 'via') => {
    markChanged();
    setPoints((current) => setIntermediatePointKind(current, id, kind));
  };

  const removePoint = (id: string) => {
    markChanged();
    if (activePlacementPointId === id) setActivePlacementPointId(null);
    if (selectedPointId === id) setSelectedPointId(null);
    setPoints((current) => removePointById(current, id));
  };

  const setTitle = (title: string) => {
    markChanged();
    setDraft((current) => ({ ...current, title }));
  };

  const setAvoidance = (flag: 'avoidHighways' | 'avoidTolls' | 'avoidFerries', value: boolean) => {
    markChanged();
    setDraft((current) => ({ ...current, [flag]: value }));
  };

  const runPreview = async () => {
    if (!definition || !isCompleteDefinition(definition)) {
      if (firstIncomplete) {
        setSelectedPointId(firstIncomplete.point.id);
        setError(`${firstIncomplete.identity.token} needs a location. Use Search or Place ${firstIncomplete.identity.token} on map below.`);
      }
      return;
    }
    setBusy('preview');
    setError(null);
    setHint(null);
    try {
      const preview = await previewRoute(definition);
      setDraft((current) => ({ ...current, preview, previewStale: false }));
      onChangeRef.current?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not preview that route.');
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    if (!definition || !draft.preview || draft.previewStale) return;
    setBusy('save');
    setError(null);
    setHint(null);
    try {
      const result = await saveRoute(definition, draft.preview, draft.routePlanId);
      setDraft((current) => ({ ...current, saved: result, routePlanId: result.routePlanId }));
      onChangeRef.current?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not save that route.');
    } finally {
      setBusy(null);
    }
  };

  const clear = (next?: Partial<RouteLegDraft>) => {
    setDraft(createRouteLegDraft(next ?? initial));
    setSearchingPointId(null);
    setSelectedPointId(null);
    setActivePlacementPointId(null);
    setDraggingPointId(null);
    setSuggestions([]);
    setError(null);
    setHint(null);
    placeSession.current = crypto.randomUUID();
    onChangeRef.current?.();
  };

  const replaceDraft = (next: RouteLegDraft) => {
    setDraft(next);
    setSearchingPointId(null);
    setActivePlacementPointId(null);
    setSuggestions([]);
    setError(null);
    setHint(null);
  };

  return {
    instanceId,
    maxPoints,
    draft,
    definition,
    busy,
    error,
    hint,
    suggestions,
    searchingPointId,
    selectedPointId,
    activePlacementPointId,
    draggingPointId,
    firstIncomplete,
    previewReady,
    freshPreview,
    previewMessage,
    actions: {
      selectPoint,
      setSelectedPointId,
      updatePointQuery,
      choosePlace,
      addIntermediate,
      addMapPoint,
      moveMapPoint,
      movePoint,
      reorderWaypoint,
      setIntermediateKind,
      removePoint,
      setTitle,
      setAvoidance,
      setSearchingPointId,
      setActivePlacementPointId,
      setDraggingPointId,
      setSuggestions,
      setHint,
      setError,
    },
    runPreview,
    runSave,
    clear,
    replaceDraft,
  };
}

export type RouteLegEditorApi = ReturnType<typeof useRouteLegEditor>;
