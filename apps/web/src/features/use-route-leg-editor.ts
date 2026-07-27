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
  namePointFromReverseGeocode,
  previewMessageFor,
  removePointById,
  reorderPointList,
  resolvePointToPlace,
  setIntermediatePointKind,
  setPointStopLabels,
  swapAdjacentPoint,
  type DraftPoint,
  type RouteLegDraft,
} from './route-leg-editor-core';
import { describeDroppedPin } from './place-reverse';
import type { StopLabel } from './trip-stop-projection';
import { firstIncompletePoint, isRoutePointComplete, placeExistingRoutePoint } from './route-point-identity';
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
  /** Non-null while the palette is laying a chain of stops/vias (see beginChain). */
  const [chainKind, setChainKind] = useState<'stop' | 'via' | null>(null);
  // Google Places session tokens are per autocomplete-then-details sequence and
  // per editor instance; sharing one across day editors misbills the account.
  const placeSession = useRef(crypto.randomUUID());
  // Draft generation. replaceDraft/clear bump it; an async preview/save result
  // from a previous generation is discarded instead of landing in whichever
  // draft is now loaded (the trip editor re-points one hook across days).
  const draftEpoch = useRef(0);
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

  /**
   * Palette entry point: arm an intermediate AND stay armed, so a rider lays a
   * chain of stops with one click per stop instead of one click per stop plus
   * one to re-arm. Mirrors the device, where stop/via placement deliberately
   * does not auto-disarm (route-planner-screen.tsx:497-525). Tapping the lit
   * disc again ends the chain.
   */
  const beginChain = (kind: 'stop' | 'via') => {
    if (chainKind === kind) { endChain(); return; }
    setChainKind(kind);
    addIntermediate(kind);
  };

  const endChain = () => {
    setChainKind(null);
    // Drop the trailing blank the chain armed but the rider never placed —
    // otherwise ending a chain leaves an incomplete point that blocks preview
    // and reads as "S needs a location" for a stop nobody asked for.
    setPoints((current) => {
      const armed = current.find((point) => point.id === activePlacementPointId);
      return armed && !isRoutePointComplete(armed) && armed.kind !== 'origin' && armed.kind !== 'destination'
        ? removePointById(current, armed.id)
        : [...current];
    });
    setActivePlacementPointId(null);
    setSearchingPointId(null);
  };

  /** Fire-and-forget naming for a pin that just landed. Never blocks, never throws. */
  const nameDroppedPoint = (pointId: string, latitude: number, longitude: number, placedLabel: string) => {
    const epoch = draftEpoch.current;
    void describeDroppedPin(latitude, longitude).then((name) => {
      if (!name || draftEpoch.current !== epoch) return;
      setPoints((current) => namePointFromReverseGeocode(current, pointId, { latitude, longitude, expectedName: placedLabel, name }));
    });
  };

  const addMapPoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!activePlacementPointId) {
      setError('Choose a route point first, then use “Place on map.” KSU will never add an unplanned waypoint from a map click.');
      return;
    }
    const placedId = activePlacementPointId;
    const location = droppedPinLocation({ latitude, longitude });
    markChanged();
    setSearchingPointId(null);
    setSuggestions([]);

    // Chaining: place the armed point, then insert and arm the next one in the
    // same update so the rider's next map click keeps building. `draft.points`
    // is this render's list, which is the right length to test against the cap
    // because a chain advances exactly one point per click.
    const chaining = chainKind !== null && draft.points.length < maxPoints;
    const next = chaining ? blankPoint(chainKind!) : null;
    setPoints((current) => {
      const placed = placeExistingRoutePoint(current, placedId, location);
      return next ? insertIntermediatePoint(placed, next) : placed;
    });
    setSelectedPointId(next ? next.id : placedId);
    setActivePlacementPointId(next ? next.id : null);
    if (!chaining) setChainKind(null);

    nameDroppedPoint(placedId, latitude, longitude, location.displayName);
  };

  const setStopLabels = (id: string, labels: readonly StopLabel[]) => {
    // Purpose is metadata, not geometry: it must NOT mark the paid preview
    // stale. The device makes the same exception deliberately
    // (route-planner-screen.tsx:290-295) — tagging a stop "food" does not
    // change the road, so charging the rider a fresh preview for it is wrong.
    setPoints((current) => setPointStopLabels(current, id, labels));
    onChangeRef.current?.();
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

  const runPreview = async (): Promise<boolean> => {
    if (!definition || !isCompleteDefinition(definition)) {
      if (firstIncomplete) {
        setSelectedPointId(firstIncomplete.point.id);
        setError(`${firstIncomplete.identity.token} needs a location. Use Search or Place ${firstIncomplete.identity.token} on map below.`);
      }
      return false;
    }
    const epoch = draftEpoch.current;
    setBusy('preview');
    setError(null);
    setHint(null);
    try {
      const preview = await previewRoute(definition);
      if (draftEpoch.current !== epoch) return false;
      setDraft((current) => ({ ...current, preview, previewStale: false }));
      onChangeRef.current?.();
      return true;
    } catch (reason) {
      if (draftEpoch.current === epoch) setError(reason instanceof Error ? reason.message : 'KSU could not preview that route.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    if (!definition || !draft.preview || draft.previewStale) return;
    const epoch = draftEpoch.current;
    setBusy('save');
    setError(null);
    setHint(null);
    try {
      const result = await saveRoute(definition, draft.preview, draft.routePlanId);
      if (draftEpoch.current !== epoch) return;
      setDraft((current) => ({ ...current, saved: result, routePlanId: result.routePlanId }));
      onChangeRef.current?.();
    } catch (reason) {
      if (draftEpoch.current === epoch) setError(reason instanceof Error ? reason.message : 'KSU could not save that route.');
    } finally {
      setBusy(null);
    }
  };

  const clear = (next?: Partial<RouteLegDraft>) => {
    draftEpoch.current += 1;
    setDraft(createRouteLegDraft(next ?? initial));
    setSearchingPointId(null);
    setSelectedPointId(null);
    setActivePlacementPointId(null);
    setDraggingPointId(null);
    setChainKind(null);
    setSuggestions([]);
    setError(null);
    setHint(null);
    placeSession.current = crypto.randomUUID();
    onChangeRef.current?.();
  };

  const replaceDraft = (next: RouteLegDraft) => {
    draftEpoch.current += 1;
    setDraft(next);
    setSearchingPointId(null);
    setActivePlacementPointId(null);
    setChainKind(null);
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
    chainKind,
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
      beginChain,
      endChain,
      setStopLabels,
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
