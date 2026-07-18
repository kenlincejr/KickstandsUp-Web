import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import { GoogleRouteMap } from './google-route-map';
import { firstIncompletePoint, isRoutePointComplete, placeExistingRoutePoint, routePointIdentity } from './route-point-identity';
import { plannerGuideSteps, plannerGuideStorageKey, shouldShowPlannerGuide } from './planner-onboarding';
import { nextPlannerAction } from './planner-post-preview';
import { fuelPlanForBike, manualPlannerFuelPlan, plannerFuelSourceLabel, type PlannerFuelPlan, type PlannerGarageBike } from './planner-fuel-plan';
import { listPlannerGarage } from './planner-garage-repository';
import { publicEnv } from '../lib/env';
import {
  decodePolyline,
  getRouteWeather,
  isCompleteDefinition,
  previewRoute,
  resolvePlace,
  saveRoute,
  searchPlaces,
  type PlaceSuggestion,
  type PlannerWaypoint,
  type RouteDefinition,
  type RoutePreview,
  type RouteWeatherResponse,
  type SavedRevision,
} from './route-planner-repository';

type DraftPoint = Omit<PlannerWaypoint, 'latitude' | 'longitude' | 'source' | 'coordinateProvenance'> & {
  id: string;
  latitude?: number;
  longitude?: number;
  source?: PlannerWaypoint['source'];
  coordinateProvenance?: PlannerWaypoint['coordinateProvenance'];
};

function blankPoint(kind: DraftPoint['kind']): DraftPoint {
  return { id: crypto.randomUUID(), kind, displayName: '' };
}

function miles(meters: number) {
  return `${Math.round(meters / 1609.344)} mi`;
}

function rideTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function RoutePlannerPage() {
  const [title, setTitle] = useState('My next ride');
  const [points, setPoints] = useState<DraftPoint[]>([blankPoint('origin'), blankPoint('destination')]);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);
  const [fuelRangeMiles, setFuelRangeMiles] = useState('150');
  const [fuelReservePercent, setFuelReservePercent] = useState('20');
  const [garage, setGarage] = useState<PlannerGarageBike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState('manual');
  const [fuelSource, setFuelSource] = useState<PlannerFuelPlan['source']>('manual');
  const [showTraffic, setShowTraffic] = useState(false);
  const [activePlacementPointId, setActivePlacementPointId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showPlanningGuide, setShowPlanningGuide] = useState(true);
  const [searchingPointId, setSearchingPointId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState<'preview' | 'save' | 'place' | 'weather' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [weather, setWeather] = useState<RouteWeatherResponse | null>(null);
  const [saved, setSaved] = useState<SavedRevision | null>(null);
  const [routePlanId, setRoutePlanId] = useState<string | undefined>();
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const placeSession = useRef(crypto.randomUUID());
  const plannerRef = useRef<HTMLElement>(null);
  const weatherRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setShowPlanningGuide(shouldShowPlannerGuide(window.localStorage.getItem(plannerGuideStorageKey)));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void listPlannerGarage(controller.signal).then((bikes) => {
      if (controller.signal.aborted) return;
      setGarage(bikes);
      const active = bikes.find((bike) => bike.isActive) ?? bikes[0];
      const plan = active && fuelPlanForBike(active, Number(fuelReservePercent));
      if (plan) { setSelectedBikeId(active.id); setFuelRangeMiles(String(plan.rangeMiles)); setFuelSource(plan.source); }
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const fuelPlanSnapshot = useMemo(() => {
    const selectedBike = garage.find((bike) => bike.id === selectedBikeId);
    if (selectedBike && fuelSource === 'bike_band_estimate') return fuelPlanForBike(selectedBike, Number(fuelReservePercent));
    return manualPlannerFuelPlan(Number(fuelRangeMiles), Number(fuelReservePercent), fuelSource === 'route_override' ? 'route_override' : 'manual');
  }, [fuelRangeMiles, fuelReservePercent, fuelSource, garage, selectedBikeId]);

  const definition = useMemo<RouteDefinition | null>(() => {
    const resolved = points.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.source && point.coordinateProvenance);
    if (!resolved) return null;
    return {
      title: title.trim() || 'Untitled route', avoidHighways, avoidTolls, avoidFerries,
      ...(fuelPlanSnapshot ? { fuelPlan: fuelPlanSnapshot } : {}),
      waypoints: points.map(({ id: _id, ...point }) => point as PlannerWaypoint),
    };
  }, [avoidFerries, avoidHighways, avoidTolls, fuelPlanSnapshot, points, title]);

  const activeSearch = points.find((point) => point.id === searchingPointId);
  const incompletePoints = points.filter((point) => !isRoutePointComplete(point));
  const previewReady = Boolean(definition && isCompleteDefinition(definition));
  const firstIncomplete = firstIncompletePoint(points);
  const freshPreview = Boolean(preview && !previewStale);
  const previewMessage = previewReady
    ? previewStale ? 'Route changed after preview. Preview the updated route before conditions or handoff.' : 'Every point is set. Preview the actual roads, then check conditions.'
    : firstIncomplete ? `${firstIncomplete.identity.token} needs a location. Search for it or place that exact point on the map.` : 'Add a start and finish to begin.';
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
      if (!(target instanceof Element) || !target.closest('.stop-editor')) {
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
  }, [searchingPointId]);

  useEffect(() => {
    if (weather) weatherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [weather]);

  const markChanged = () => {
    setPreviewStale(Boolean(preview));
    setWeather(null);
    setSaved(null);
    setError(null);
  };

  const updatePointQuery = (id: string, displayName: string) => {
    markChanged();
    setSearchingPointId(id);
    setSelectedPointId(id);
    setActivePlacementPointId(null);
    setSuggestions([]);
    setPoints((current) => current.map((point) => point.id === id ? {
      ...point, displayName, latitude: undefined, longitude: undefined, googlePlaceId: undefined, source: undefined, coordinateProvenance: undefined,
    } : point));
  };

  const choosePlace = async (pointId: string, suggestion: PlaceSuggestion) => {
    setBusy('place');
    setError(null);
    try {
      const place = await resolvePlace(suggestion.placeId, placeSession.current);
      setPoints((current) => current.map((point) => point.id === pointId ? {
        ...point,
        displayName: place.address ? `${place.displayName} — ${place.address}` : place.displayName,
        latitude: place.latitude,
        longitude: place.longitude,
        googlePlaceId: place.placeId,
        source: 'google_place',
        coordinateProvenance: 'google_places',
      } : point));
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
    setPoints((current) => [...current.slice(0, -1), point, current.at(-1)!]);
  };

  const addFuelStop = (mile: number) => {
    addIntermediate('stop');
    setError(`Fuel window near mile ${mile}: choose the actual stop by searching or placing this Stop here point on the map.`);
  };

  const selectPoint = (pointId: string) => {
    setSelectedPointId(pointId);
    window.requestAnimationFrame(() => document.getElementById(`route-point-${pointId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const dismissPlanningGuide = () => {
    window.localStorage.setItem(plannerGuideStorageKey, 'dismissed');
    setShowPlanningGuide(false);
  };

  const restorePlanningGuide = () => {
    window.localStorage.removeItem(plannerGuideStorageKey);
    setShowPlanningGuide(true);
  };

  const addMapPoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!activePlacementPointId) {
      setError('Choose a route point first, then use “Place on map.” KSU will never add an unplanned waypoint from a map click.');
      return;
    }
    markChanged();
    setSearchingPointId(null);
    setSuggestions([]);
    setPoints((current) => {
      const location = { displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude, source: 'manual' as const, coordinateProvenance: 'ksu_customer' as const };
      return placeExistingRoutePoint(current, activePlacementPointId, location);
    });
    setSelectedPointId(activePlacementPointId);
    setActivePlacementPointId(null);
  };

  const moveMapPoint = (id: string, { latitude, longitude }: { latitude: number; longitude: number }) => {
    markChanged();
    setPoints((current) => current.map((point) => point.id === id ? {
      ...point, displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude,
      googlePlaceId: undefined, source: 'manual', coordinateProvenance: 'ksu_customer',
    } : point));
    setSelectedPointId(id);
  };

  const movePoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (index === 0 || index === points.length - 1 || target === 0 || target === points.length - 1) return;
    markChanged();
    setPoints((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
    try {
      setPreview(await previewRoute(definition));
      setPreviewStale(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not preview that route.');
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    if (!definition || !preview || previewStale) return;
    setBusy('save');
    setError(null);
    try {
      const result = await saveRoute(definition, preview, routePlanId);
      setSaved(result);
      setRoutePlanId(result.routePlanId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not save that route.');
    } finally {
      setBusy(null);
    }
  };

  const reorderWaypoint = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    markChanged();
    setPoints((current) => {
      const fromIndex = current.findIndex((point) => point.id === fromId);
      const toIndex = current.findIndex((point) => point.id === toId);
      if (fromIndex <= 0 || toIndex <= 0 || fromIndex === current.length - 1 || toIndex === current.length - 1) return current;
      const next = [...current];
      const [moving] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moving);
      return next;
    });
  };

  const beginWaypointDrag = (event: DragEvent<HTMLButtonElement>, pointId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', pointId);
    setDraggingPointId(pointId);
  };

  const setIntermediateKind = (id: string, kind: 'stop' | 'via') => {
    markChanged();
    setPoints((current) => current.map((point) => point.id === id ? { ...point, kind } : point));
  };

  const runWeather = async () => {
    if (!preview || previewStale) return;
    setBusy('weather');
    setError(null);
    try {
      setWeather(await getRouteWeather(preview));
    } catch (reason) {
      setWeather(null);
      setError(reason instanceof Error ? reason.message : 'Weather conditions are temporarily unavailable. Your route is still ready.');
      window.requestAnimationFrame(() => plannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } finally {
      setBusy(null);
    }
  };

  const clearRoute = () => {
    if (!window.confirm('Clear this route and start over? This removes the unsaved waypoints, road preferences, and preview. Saved routes stay in My Routes.')) return;
    setTitle('My next ride');
    setPoints([blankPoint('origin'), blankPoint('destination')]);
    setAvoidHighways(false);
    setAvoidTolls(false);
    setAvoidFerries(false);
    setShowTraffic(false);
    setSearchingPointId(null);
    setSuggestions([]);
    setPreview(null);
    setPreviewStale(false);
    setWeather(null);
    setSaved(null);
    setRoutePlanId(undefined);
    setError(null);
    placeSession.current = crypto.randomUUID();
  };

  const plottedPoints = freshPreview ? decodePolyline(preview!.encodedPolyline) : definition?.waypoints ?? [];
  const handoffs = definition && freshPreview ? buildGoogleMapsHandoffs(definition.waypoints) : [];
  const smartStops = preview ? buildSmartStops(preview.distanceMeters, Number(fuelRangeMiles), Number(fuelReservePercent)) : null;
  const nextAction = nextPlannerAction({ freshPreview, conditionsChecked: Boolean(weather), saved: Boolean(saved) });

  return (
    <section className="tool-page planner-page" ref={plannerRef}>
      <header className="tool-header">
        <div><p className="kicker">KSU ROUTE LAB</p><h1>Build the ride. Keep the route.</h1><p>Search real places, preview the road, then save an immutable KSU revision.</p></div>
        <div className="route-header-actions">
          <p className={`preview-status ${previewReady ? 'ready' : ''}`} aria-live="polite">{previewMessage}</p>
          <div className="button-row">
          <button className="danger-button" disabled={busy !== null} onClick={clearRoute} type="button">Clear route</button>
          <button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button>
          <button className="primary-button" disabled={busy !== null} onClick={() => void runPreview()} type="button">{busy === 'preview' ? 'Calculating…' : previewStale ? 'Preview updated route' : preview ? 'Refresh preview' : previewReady ? 'Preview route' : firstIncomplete ? `Finish ${firstIncomplete.identity.token} to preview` : 'Finish route to preview'}</button>
          </div>
          <details className="planner-help-menu">
            <summary>Planning help</summary>
            <p>Need a quick reset? The guide shows the rider-safe planning flow without clearing your route.</p>
            <button className="text-button" onClick={restorePlanningGuide} type="button">Show planning guide</button>
          </details>
        </div>
      </header>
      {error ? <div className="planner-notice error" role="alert">{error}</div> : null}
      {saved ? <div className="planner-notice success">Route saved to My routes. <Link to={`/app/routes/${saved.routePlanId}`}>Open saved route →</Link></div> : null}
      {showPlanningGuide ? <section className="planner-guide" aria-labelledby="planner-guide-title">
        <div><p className="kicker">PLAN THIS RIDE</p><h2 id="planner-guide-title">Three moves. No mystery waypoint.</h2></div>
        <ol>{plannerGuideSteps.map((step, index) => <li key={step.title}><b>{index + 1}</b><span><strong>{step.title}</strong><small>{step.detail}</small></span></li>)}</ol>
        <button className="text-button" onClick={dismissPlanningGuide} type="button">Got it — hide guide</button>
      </section> : null}
      <div className="planner-grid">
        <aside className="planner-panel">
          <label className="planner-title"><span>Route name</span><input maxLength={120} onChange={(event) => { markChanged(); setTitle(event.target.value); }} value={title} /></label>
          <div className="metric-row">
            <span><b>{preview ? miles(preview.distanceMeters) : '—'}</b> distance</span>
            <span><b>{preview ? rideTime(preview.durationSeconds) : '—'}</b> saddle</span>
            <span><b>{points.length}</b> points</span>
          </div>
          <section className={`preview-readiness ${previewReady ? 'ready' : ''}`} aria-live="polite">
            <p className="kicker">PREVIEW CHECK</p>
            <strong>{previewStale ? 'Route changed after preview.' : previewReady ? 'Ready to preview the road.' : 'Finish these before Preview route.'}</strong>
            <ul>
               {points.map((point, index) => {
                 const identity = routePointIdentity(points, index);
                 const complete = isRoutePointComplete(point);
                 return <li key={point.id} className={complete ? 'complete' : ''}>{complete ? '✓' : '○'} {identity.token} · {complete ? 'Ready' : 'Needs a location'} <button onClick={() => complete ? selectPoint(point.id) : (selectPoint(point.id), setActivePlacementPointId(point.id))} type="button">{complete ? `Select ${identity.token}` : `Place ${identity.token} on map`}</button></li>;
               })}
            </ul>
          </section>
          <ol className="planner-stop-list">
            {points.map((point, index) => <Fragment key={point.id}>
              <li id={`route-point-${point.id}`} className={`${draggingPointId === point.id ? 'waypoint-row dragging' : 'waypoint-row'} ${selectedPointId === point.id ? 'selected' : ''}`} onClick={() => selectPoint(point.id)} onDragOver={index > 0 && index < points.length - 1 ? (event) => event.preventDefault() : undefined} onDrop={index > 0 && index < points.length - 1 ? (event) => { event.preventDefault(); reorderWaypoint(event.dataTransfer.getData('text/plain'), point.id); setDraggingPointId(null); } : undefined}>
              <div className="stop-number">{routePointIdentity(points, index).token}</div>
              <div className="stop-editor">
                <label><span>{routePointIdentity(points, index).purpose.toUpperCase()}</span><input autoComplete="off" onChange={(event) => updatePointQuery(point.id, event.target.value)} onFocus={() => { setSearchingPointId(point.id); setSelectedPointId(point.id); }} placeholder={point.kind === 'origin' ? 'Search starting place' : point.kind === 'destination' ? 'Search destination' : point.kind === 'stop' ? 'Search a stop' : 'Search a road to ride through'} value={point.displayName} /></label>
                {index > 0 && index < points.length - 1 ? <>
                  <div className="waypoint-kind" aria-label={`${routePointIdentity(points, index).token} purpose`}>
                    <button aria-pressed={point.kind === 'stop'} className={point.kind === 'stop' ? 'selected' : ''} onClick={() => setIntermediateKind(point.id, 'stop')} type="button"><b>Stop here</b><small>Fuel, food, or regroup</small></button>
                    <button aria-pressed={point.kind === 'via'} className={point.kind === 'via' ? 'selected' : ''} onClick={() => setIntermediateKind(point.id, 'via')} type="button"><b>Ride through</b><small>Stay on this road</small></button>
                  </div>
                  <small className="point-purpose">{point.kind === 'stop' ? 'The group plans to pull over here.' : 'This holds the group to the road you picked.'}</small>
                </> : null}
                {searchingPointId === point.id && suggestions.length ? <div className="place-results">{suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void choosePlace(point.id, suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
                {isRoutePointComplete(point) ? <small className="resolved-place">Ready · {point.latitude!.toFixed(4)}, {point.longitude!.toFixed(4)}</small> : <div className="point-recovery"><button onClick={() => { setSelectedPointId(point.id); setSearchingPointId(point.id); setActivePlacementPointId(null); }} type="button">Search</button><button onClick={() => { setSelectedPointId(point.id); setActivePlacementPointId(point.id); setSearchingPointId(null); }} type="button">Place {routePointIdentity(points, index).token} on map</button></div>}
              </div>
              <div className="stop-actions">
                {index > 0 && index < points.length - 1 ? <>
                   <button aria-label={`Drag ${routePointIdentity(points, index).token} to reorder`} className="drag-waypoint" draggable onDragEnd={() => setDraggingPointId(null)} onDragStart={(event) => beginWaypointDrag(event, point.id)} type="button"><span aria-hidden="true">⠿</span><small>Drag</small></button>
                   <button aria-label="Move waypoint up" disabled={index === 1} onClick={() => movePoint(index, -1)} type="button">↑</button>
                  <button aria-label="Move waypoint down" disabled={index === points.length - 2} onClick={() => movePoint(index, 1)} type="button">↓</button>
                   <button aria-label="Remove waypoint" onClick={() => { markChanged(); if (activePlacementPointId === point.id) setActivePlacementPointId(null); if (selectedPointId === point.id) setSelectedPointId(null); setPoints((current) => current.filter((item) => item.id !== point.id)); }} type="button">×</button>
                </> : null}
              </div>
              </li>
              {index === 0 ? <li className="waypoint-insert"><div><p className="kicker">BUILD THE RIDE</p><strong>Add a point between Start and Finish</strong><small>Add only the point you intend to place.</small></div><div className="insert-actions"><button disabled={points.length >= 27} onClick={() => addIntermediate('stop')} type="button">＋ Add stop</button><button disabled={points.length >= 27} onClick={() => addIntermediate('via')} type="button">＋ Add ride-through road</button></div></li> : null}
            </Fragment>)}
          </ol>
          <fieldset className="route-options"><legend>Road preferences</legend>
            <label><input checked={avoidHighways} onChange={(event) => { markChanged(); setAvoidHighways(event.target.checked); }} type="checkbox" /> Avoid highways</label>
            <label><input checked={avoidTolls} onChange={(event) => { markChanged(); setAvoidTolls(event.target.checked); }} type="checkbox" /> Avoid tolls</label>
            <label><input checked={avoidFerries} onChange={(event) => { markChanged(); setAvoidFerries(event.target.checked); }} type="checkbox" /> Avoid ferries</label>
            <label><input checked={showTraffic} onChange={(event) => setShowTraffic(event.target.checked)} type="checkbox" /> Show live traffic</label>
          </fieldset>
          <section className="smart-stops" aria-labelledby="smart-stops-title"><p className="kicker">SMART STOPS</p><h2 id="smart-stops-title">Fuel and crew-break windows.</h2><p>Set the range you trust, not the number printed in a brochure. KSU plans the window; you choose the actual stop.</p>{garage.length ? <label><span>Ride this bike</span><select value={selectedBikeId} onChange={(event) => { const bike = garage.find((candidate) => candidate.id === event.target.value); const plan = bike && fuelPlanForBike(bike, Number(fuelReservePercent)); setSelectedBikeId(event.target.value); if (plan) { setFuelRangeMiles(String(plan.rangeMiles)); setFuelSource(plan.source); } }}><option value="manual">Use a route-only plan</option>{garage.map((bike) => <option key={bike.id} value={bike.id}>{bike.label}{bike.isActive ? ' (active)' : ''}</option>)}</select></label> : <small>No garage bike is required. Use a range you trust for this ride.</small>}<small className="point-purpose">{fuelPlanSnapshot ? plannerFuelSourceLabel(fuelPlanSnapshot.source) : 'Enter a comfortable range between 40 and 400 miles.'}{fuelPlanSnapshot?.bikeLabel ? ` · ${fuelPlanSnapshot.bikeLabel}` : ''}. This stays private to you.</small><div className="smart-stop-inputs"><label><span>Comfortable range</span><input inputMode="numeric" max="400" min="40" onChange={(event) => { setFuelRangeMiles(event.target.value.replace(/\D/g, '').slice(0, 3)); setFuelSource(selectedBikeId === 'manual' ? 'manual' : 'route_override'); }} value={fuelRangeMiles} /> mi</label><label><span>Keep in reserve</span><input inputMode="numeric" max="50" min="5" onChange={(event) => { setFuelReservePercent(event.target.value.replace(/\D/g, '').slice(0, 2)); setFuelSource(selectedBikeId === 'manual' ? 'manual' : 'route_override'); }} value={fuelReservePercent} /> %</label></div>{smartStops ? smartStops.length ? <ol className="smart-stop-list">{smartStops.map((mile, index) => <li key={mile}><b>Fuel window {index + 1}</b><span>Start looking near mile {Math.max(1, mile - 15)} · aim to fuel by mile {mile}</span><button className="text-button" disabled={points.length >= 27} onClick={() => addFuelStop(mile)} type="button">Add fuel stop near this window</button></li>)}</ol> : <small>This ride fits inside your current range plan.</small> : <small>Preview the route to build stop windows.</small>}</section>
        </aside>
        <div className="map-canvas route-preview-canvas">
          <GoogleRouteMap apiKey={publicEnv.googleMapsBrowserKey} mapId={publicEnv.googleMapId} onMapClick={addMapPoint} onPointMoved={moveMapPoint} onPointSelected={selectPoint} points={points.flatMap((point, index) => typeof point.latitude === 'number' && typeof point.longitude === 'number' ? [{ ...point, latitude: point.latitude, longitude: point.longitude, ...routePointIdentity(points, index), selected: point.id === selectedPointId }] : [])} routePoints={plottedPoints} selectedPointId={selectedPointId} showTraffic={showTraffic} />
        </div>
      </div>
      <section className="planner-action-rail" aria-labelledby="planner-action-rail-title">
        <header><div><p className="kicker">NEXT RIDER JOB</p><h2 id="planner-action-rail-title">{freshPreview ? 'Route is fresh. Keep the plan honest.' : 'Preview the route before downstream actions.'}</h2></div><p className={`route-freshness ${freshPreview ? 'fresh' : 'stale'}`}>{freshPreview ? `Fresh route preview · calculated ${formatTimestamp(preview!.calculatedAt)} · valid until ${formatTimestamp(preview!.expiresAt)}` : preview ? 'Route changed after preview · conditions, save, and handoff are paused.' : 'No route preview yet.'}</p></header>
        <div className="planner-action-grid">
          <article className={nextAction === 'review' ? 'primary' : ''}><span>1</span><h3>Review the road</h3><p>{freshPreview ? `${miles(preview!.distanceMeters)} · ${rideTime(preview!.durationSeconds)} · ${points.length} route points.` : 'Preview the current itinerary to calculate distance, time, and a fresh road shape.'}</p><button className="secondary-button" disabled={!previewReady || busy !== null} onClick={() => void runPreview()} type="button">{previewStale ? 'Preview updated route' : 'Review route preview'}</button></article>
          <article><span>2</span><h3>Plan fuel & stops</h3><p>{smartStops?.length ? `${smartStops.length} fuel window${smartStops.length === 1 ? '' : 's'} are ready above. Choose each actual stop yourself.` : 'Fuel windows appear after a route preview; KSU never inserts a business for you.'}</p><button className="text-button" onClick={() => document.getElementById('smart-stops-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} type="button">Review fuel plan</button></article>
          <article className={nextAction === 'conditions' ? 'primary' : ''}><span>3</span><h3>Check conditions</h3><p>{weather ? `Conditions checked ${formatTimestamp(weather.generatedAt)}. They are planning signals, not a safety guarantee.` : 'Check Start, Mid-route, and Finish only after a fresh preview.'}</p><button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void runWeather()} type="button">{busy === 'weather' ? 'Checking conditions…' : weather ? 'Refresh conditions' : 'Check route conditions'}</button></article>
          <article className={nextAction === 'save' ? 'primary' : ''}><span>4</span><h3>Save route</h3><p>{saved ? `Saved as revision ${saved.revisionNumber}. Editing the draft will create the next immutable revision.` : 'Saving creates a private, editable KSU route revision. It does not publish or share it.'}</p><button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button></article>
          <article className={nextAction === 'handoff' ? 'primary' : ''}><span>5</span><h3>Navigate in Google Maps</h3><p>{handoffs.length ? handoffs.length === 1 ? 'One supported leg. Google Maps gets the full route link.' : `${handoffs.length} legs. Continue with the next leg at each boundary stop.` : 'A fresh preview is required before Google Maps handoff.'}</p>{handoffs.map((handoff) => <div className="handoff-diagnostic" key={handoff.segmentNumber}><a className="secondary-button" href={handoff.url} rel="noreferrer" target="_blank">{handoff.segmentCount > 1 ? `Open leg ${handoff.segmentNumber} of ${handoff.segmentCount}` : 'Open the full route in Google Maps'}</a><small>{handoff.segmentCount > 1 && handoff.nextLegLabel ? `Next leg: ${handoff.nextLegLabel}. ` : ''}{handoff.fidelityWarning ?? handoff.browserWaypointWarning}</small></div>)}</article>
          <article className="planner-sharing-state"><span>6</span><h3>Share or add to a ride</h3><p>{saved ? 'This saved revision is still private. Open it to choose an authorized ride or sharing flow; a route is never published just because it was saved.' : 'Save a revision first. KSU keeps saving, sharing, and publishing as separate decisions.'}</p>{saved ? <><Link className="secondary-button" to={`/app/routes/${saved.routePlanId}`}>Open saved route</Link><button className="text-button" onClick={() => window.print()} type="button">Print private route sheet</button><small>QR sharing stays off until an authorization-appropriate route link exists.</small></> : null}</article>
        </div>
      </section>
      {saved && freshPreview ? <section className="print-route-sheet" aria-label="Private printable route sheet">
        <p>KSU PRIVATE ROUTE SHEET · Revision {saved.revisionNumber}</p><h2>{title.trim() || 'Untitled route'}</h2><p>{miles(preview!.distanceMeters)} · {rideTime(preview!.durationSeconds)} · Previewed {formatTimestamp(preview!.calculatedAt)}</p>
        <ol>{points.map((point, index) => <li key={point.id}><b>{routePointIdentity(points, index).token}</b><span>{point.displayName || 'Needs a location'}{index > 0 && index < points.length - 1 ? ` · ${routePointIdentity(points, index).purpose}` : ''}</span></li>)}</ol>
        <small>Private saved route. Share or publish only through an authorized KSU flow.</small>
      </section> : null}
      {weather ? <section className="route-weather" aria-labelledby="route-weather-title" ref={weatherRef} tabIndex={-1}>
        <div className="route-weather-heading">
          <div><p className="kicker">ROUTE BRIEF</p><h2 id="route-weather-title">The things worth thinking about before you roll.</h2></div>
          <p>{weather.cacheHit ? 'Cached result' : 'Freshly fetched'} · generated {formatTimestamp(weather.generatedAt)}</p>
        </div>
        <div className="route-brief-signals">{buildRouteBrief(weather).map((signal) => <article className={signal.tone} key={signal.title}><b>{signal.title}</b><span>{signal.detail}</span></article>)}</div>
        <div className="weather-grid">
          {weather.conditions.map((condition) => <article key={condition.label}>
            <div className="weather-card-top"><div><span>{condition.label}</span><h3>{condition.description}</h3></div>{condition.iconUrl ? <img alt="" src={condition.iconUrl} /> : null}</div>
            <strong>{condition.temperatureF === null ? '—' : `${Math.round(condition.temperatureF)}°F`}</strong>
            <dl>
              <div><dt>Feels</dt><dd>{condition.feelsLikeF === null ? '—' : `${Math.round(condition.feelsLikeF)}°`}</dd></div>
              <div><dt>Rain</dt><dd>{condition.precipitationChance === null ? '—' : `${Math.round(condition.precipitationChance)}%`}</dd></div>
              <div><dt>Wind</dt><dd>{condition.windMph === null ? '—' : `${Math.round(condition.windMph)} mph`}</dd></div>
              <div><dt>Gusts</dt><dd>{condition.windGustMph === null ? '—' : `${Math.round(condition.windGustMph)} mph`}</dd></div>
              <div><dt>Visibility</dt><dd>{condition.visibilityMiles === null ? '—' : `${Math.round(condition.visibilityMiles)} mi`}</dd></div>
              <div><dt>Observed</dt><dd>{formatTimestamp(condition.observedAt)}</dd></div>
            </dl>
            {condition.forecastFor ? <small>Forecast for {formatTimestamp(condition.forecastFor)}</small> : null}
          </article>)}
        </div>
        <small>Current conditions fetched at the generated time; available until {formatTimestamp(weather.expiresAt)}. Conditions can change quickly—verify alerts, road closures, and local conditions before you ride.</small>
      </section> : null}
      {busy === 'place' ? <div className="planner-busy" aria-live="polite">Resolving place…</div> : null}
    </section>
  );
}

function formatTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : 'an unknown time';
}

function buildSmartStops(distanceMeters: number, rangeMiles: number, reservePercent: number) {
  const routeMiles = distanceMeters / 1609.344;
  const reserveMiles = rangeMiles * Math.max(5, Math.min(50, reservePercent || 20)) / 100;
  const interval = rangeMiles - reserveMiles;
  if (!Number.isFinite(routeMiles) || !Number.isFinite(interval) || rangeMiles < 40 || interval <= 0 || routeMiles <= interval) return [];
  const stops: number[] = [];
  for (let mile = interval; mile < routeMiles; mile += interval) stops.push(Math.round(mile));
  return stops;
}

function buildRouteBrief(weather: RouteWeatherResponse) {
  const signals: Array<{ tone: 'clear' | 'watch' | 'caution'; title: string; detail: string }> = [];
  for (const condition of weather.conditions) {
    const where = condition.label.toLowerCase();
    if ((condition.precipitationChance ?? 0) >= 50) signals.push({ tone: 'caution', title: `${condition.label}: rain likely`, detail: `${condition.precipitationChance}% precipitation chance ${where}. Pack rain gear and leave more room.` });
    else if ((condition.precipitationChance ?? 0) >= 25) signals.push({ tone: 'watch', title: `${condition.label}: rain possible`, detail: `${condition.precipitationChance}% precipitation chance ${where}. Keep the layer handy.` });
    if ((condition.windGustMph ?? 0) >= 35) signals.push({ tone: 'caution', title: `${condition.label}: strong gusts`, detail: `Gusts near ${Math.round(condition.windGustMph!)} mph ${where}. Expect exposed bridges and open stretches to move the bike.` });
    else if ((condition.windGustMph ?? 0) >= 20) signals.push({ tone: 'watch', title: `${condition.label}: gusty`, detail: `Gusts near ${Math.round(condition.windGustMph!)} mph ${where}.` });
    if (condition.visibilityMiles !== null && condition.visibilityMiles < 3) signals.push({ tone: 'caution', title: `${condition.label}: low visibility`, detail: `Visibility is about ${Math.round(condition.visibilityMiles)} mi ${where}.` });
  }
  return signals.length ? signals : [{ tone: 'clear' as const, title: 'No big planning flags in this snapshot', detail: 'Still check alerts, pavement, and local conditions before the kickstands come up.' }];
}
