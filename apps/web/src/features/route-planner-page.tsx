import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import { GoogleRouteMap } from './google-route-map';
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

function pointLabel(point: DraftPoint, index: number, total: number) {
  if (index === 0) return 'Start';
  if (index === total - 1) return 'Finish';
  return `Waypoint ${index}`;
}

function pointPurpose(point: DraftPoint) {
  return point.kind === 'stop' ? 'The group plans to pull over here — fuel, food, meetup, or a break.' : 'The group keeps rolling here — this point simply keeps the ride on the road you picked.';
}

export function RoutePlannerPage() {
  const [title, setTitle] = useState('My next ride');
  const [points, setPoints] = useState<DraftPoint[]>([blankPoint('origin'), blankPoint('destination')]);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);
  const [fuelRangeMiles, setFuelRangeMiles] = useState('150');
  const [fuelReservePercent, setFuelReservePercent] = useState('20');
  const [showTraffic, setShowTraffic] = useState(false);
  const [mapPointKind, setMapPointKind] = useState<'stop' | 'via'>('via');
  const [searchingPointId, setSearchingPointId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState<'preview' | 'save' | 'place' | 'weather' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [weather, setWeather] = useState<RouteWeatherResponse | null>(null);
  const [saved, setSaved] = useState<SavedRevision | null>(null);
  const [routePlanId, setRoutePlanId] = useState<string | undefined>();
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const placeSession = useRef(crypto.randomUUID());
  const plannerRef = useRef<HTMLElement>(null);

  const definition = useMemo<RouteDefinition | null>(() => {
    const resolved = points.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.source && point.coordinateProvenance);
    if (!resolved) return null;
    return {
      title: title.trim() || 'Untitled route', avoidHighways, avoidTolls, avoidFerries,
      waypoints: points.map(({ id: _id, ...point }) => point as PlannerWaypoint),
    };
  }, [avoidFerries, avoidHighways, avoidTolls, points, title]);

  const activeSearch = points.find((point) => point.id === searchingPointId);
  const incompletePoints = points.filter((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !point.displayName.trim());
  const previewReady = Boolean(definition && isCompleteDefinition(definition));
  const firstIncomplete = incompletePoints[0];
  const firstIncompleteIndex = firstIncomplete ? points.indexOf(firstIncomplete) : -1;
  const previewMessage = previewReady
    ? 'Every point is set. Preview the actual roads, then check conditions.'
    : firstIncomplete ? `${pointLabel(firstIncomplete, firstIncompleteIndex, points.length)} still needs a location. Search for it or choose the next map-pin type and click the map.` : 'Add a start and finish to begin.';
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

  const markChanged = () => {
    setPreview(null);
    setWeather(null);
    setSaved(null);
    setError(null);
  };

  const updatePointQuery = (id: string, displayName: string) => {
    markChanged();
    setSearchingPointId(id);
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
    setSuggestions([]);
    setPoints((current) => [...current.slice(0, -1), point, current.at(-1)!]);
  };

  const addMapPoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    markChanged();
    setSearchingPointId(null);
    setSuggestions([]);
    setPoints((current) => {
      const location = { displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude, source: 'manual' as const, coordinateProvenance: 'ksu_customer' as const };
      if (!Number.isFinite(current[0]?.latitude)) return current.map((point, index) => index === 0 ? { ...point, ...location } : point);
      if (!Number.isFinite(current.at(-1)?.latitude)) return current.map((point, index) => index === current.length - 1 ? { ...point, ...location } : point);
      return current.length >= 27 ? current : [...current.slice(0, -1), { id: crypto.randomUUID(), kind: mapPointKind, ...location }, current.at(-1)!];
    });
  };

  const moveMapPoint = (id: string, { latitude, longitude }: { latitude: number; longitude: number }) => {
    markChanged();
    setPoints((current) => current.map((point) => point.id === id ? {
      ...point, displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude,
      googlePlaceId: undefined, source: 'manual', coordinateProvenance: 'ksu_customer',
    } : point));
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
      const missing = incompletePoints.map((point) => pointLabel(point, points.indexOf(point), points.length).toLowerCase());
      setError(`Preview needs a resolved ${missing.join(', ')}. Pick a result from the place list or click the map to set it.`);
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      setPreview(await previewRoute(definition));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not preview that route.');
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    if (!definition || !preview) return;
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
    if (!preview) return;
    setBusy('weather');
    setError(null);
    try {
      setWeather(await getRouteWeather(preview));
    } catch (reason) {
      setWeather(null);
      setError(reason instanceof Error ? reason.message : 'Weather conditions are temporarily unavailable. Your route is still ready.');
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
    setWeather(null);
    setSaved(null);
    setRoutePlanId(undefined);
    setError(null);
    placeSession.current = crypto.randomUUID();
  };

  const plottedPoints = preview ? decodePolyline(preview.encodedPolyline) : definition?.waypoints ?? [];
  const handoff = definition ? buildGoogleMapsHandoffs(definition.waypoints)[0] : null;
  const smartStops = preview ? buildSmartStops(preview.distanceMeters, Number(fuelRangeMiles), Number(fuelReservePercent)) : null;

  return (
    <section className="tool-page planner-page" ref={plannerRef}>
      <header className="tool-header">
        <div><p className="kicker">KSU ROUTE LAB</p><h1>Build the ride. Keep the route.</h1><p>Search real places, preview the road, then save an immutable KSU revision.</p></div>
        <div className="route-header-actions">
          <p className={`preview-status ${previewReady ? 'ready' : ''}`} aria-live="polite">{previewMessage}</p>
          <div className="button-row">
          <button className="danger-button" disabled={busy !== null} onClick={clearRoute} type="button">Clear route</button>
          <button className="secondary-button" disabled={!preview || busy !== null} onClick={() => void runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button>
          <button className="primary-button" disabled={!previewReady || busy !== null} onClick={() => void runPreview()} type="button">{busy === 'preview' ? 'Calculating…' : preview ? 'Refresh preview' : 'Preview route'}</button>
          </div>
        </div>
      </header>
      {error ? <div className="planner-notice error" role="alert">{error}</div> : null}
      {saved ? <div className="planner-notice success">Route saved to My routes. <Link to={`/app/routes/${saved.routePlanId}`}>Open saved route →</Link></div> : null}
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
            <strong>{previewReady ? 'Ready to preview the road.' : 'Finish these before Preview route.'}</strong>
            <ul>
              {points.map((point, index) => <li key={point.id} className={Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.displayName.trim() ? 'complete' : ''}>{Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.displayName.trim() ? '✓' : '○'} {pointLabel(point, index, points.length)} {Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.displayName.trim() ? 'ready' : 'needs a place'}</li>)}
            </ul>
          </section>
          <ol className="planner-stop-list">
            {points.map((point, index) => <Fragment key={point.id}>
              <li className={draggingPointId === point.id ? 'waypoint-row dragging' : 'waypoint-row'} onDragOver={index > 0 && index < points.length - 1 ? (event) => event.preventDefault() : undefined} onDrop={index > 0 && index < points.length - 1 ? (event) => { event.preventDefault(); reorderWaypoint(event.dataTransfer.getData('text/plain'), point.id); setDraggingPointId(null); } : undefined}>
              <div className="stop-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="stop-editor">
                <label><span>{pointLabel(point, index, points.length).toUpperCase()}</span><input autoComplete="off" onChange={(event) => updatePointQuery(point.id, event.target.value)} onFocus={() => setSearchingPointId(point.id)} placeholder={point.kind === 'origin' ? 'Search starting place' : point.kind === 'destination' ? 'Search destination' : point.kind === 'stop' ? 'Search a planned stop' : 'Search a road to ride through'} value={point.displayName} /></label>
                {index > 0 && index < points.length - 1 ? <>
                  <div className="waypoint-kind" aria-label={`Waypoint ${index} purpose`}>
                    <button aria-pressed={point.kind === 'stop'} className={point.kind === 'stop' ? 'selected' : ''} onClick={() => setIntermediateKind(point.id, 'stop')} type="button"><b>Stop</b><small>Pull over</small></button>
                    <button aria-pressed={point.kind === 'via'} className={point.kind === 'via' ? 'selected' : ''} onClick={() => setIntermediateKind(point.id, 'via')} type="button"><b>Pass-through</b><small>Keep rolling</small></button>
                  </div>
                  <small className="point-purpose">{pointPurpose(point)}</small>
                </> : null}
                {searchingPointId === point.id && suggestions.length ? <div className="place-results">{suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void choosePlace(point.id, suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
                {Number.isFinite(point.latitude) ? <small className="resolved-place">Ready · {point.latitude!.toFixed(4)}, {point.longitude!.toFixed(4)}</small> : null}
              </div>
              <div className="stop-actions">
                {index > 0 && index < points.length - 1 ? <>
                   <button aria-label={`Drag ${pointLabel(point, index, points.length)} to reorder`} className="drag-waypoint" draggable onDragEnd={() => setDraggingPointId(null)} onDragStart={(event) => beginWaypointDrag(event, point.id)} type="button"><span aria-hidden="true">⠿</span><small>Drag</small></button>
                   <button aria-label="Move waypoint up" disabled={index === 1} onClick={() => movePoint(index, -1)} type="button">↑</button>
                  <button aria-label="Move waypoint down" disabled={index === points.length - 2} onClick={() => movePoint(index, 1)} type="button">↓</button>
                  <button aria-label="Remove waypoint" onClick={() => { markChanged(); setPoints((current) => current.filter((item) => item.id !== point.id)); }} type="button">×</button>
                </> : null}
              </div>
              </li>
              {index === 0 ? <li className="waypoint-insert"><div><p className="kicker">BUILD THE RIDE</p><strong>Add a point between Start and Finish</strong><small>Stop for fuel, food, or a meetup. Pass-through to keep the group on the road you picked.</small></div><div className="insert-actions"><button disabled={points.length >= 27} onClick={() => addIntermediate('stop')} type="button">＋ Stop</button><button disabled={points.length >= 27} onClick={() => addIntermediate('via')} type="button">＋ Pass-through</button></div></li> : null}
            </Fragment>)}
          </ol>
          <fieldset className="route-options"><legend>Road preferences</legend>
            <label><input checked={avoidHighways} onChange={(event) => { markChanged(); setAvoidHighways(event.target.checked); }} type="checkbox" /> Avoid highways</label>
            <label><input checked={avoidTolls} onChange={(event) => { markChanged(); setAvoidTolls(event.target.checked); }} type="checkbox" /> Avoid tolls</label>
            <label><input checked={avoidFerries} onChange={(event) => { markChanged(); setAvoidFerries(event.target.checked); }} type="checkbox" /> Avoid ferries</label>
          </fieldset>
          <section className="smart-stops" aria-labelledby="smart-stops-title"><p className="kicker">SMART STOPS</p><h2 id="smart-stops-title">Fuel and crew-break windows.</h2><p>Set the range you trust, not the number printed in a brochure. KSU plans the window; you choose the actual stop.</p><div className="smart-stop-inputs"><label><span>Comfortable range</span><input inputMode="numeric" max="400" min="40" onChange={(event) => setFuelRangeMiles(event.target.value.replace(/\D/g, '').slice(0, 3))} value={fuelRangeMiles} /> mi</label><label><span>Keep in reserve</span><input inputMode="numeric" max="50" min="5" onChange={(event) => setFuelReservePercent(event.target.value.replace(/\D/g, '').slice(0, 2))} value={fuelReservePercent} /> %</label></div>{smartStops ? smartStops.length ? <ol className="smart-stop-list">{smartStops.map((mile, index) => <li key={mile}><b>Stop {index + 1}</b><span>Start looking near mile {Math.max(1, mile - 15)} · fuel by mile {mile}</span></li>)}</ol> : <small>This ride fits inside your current range plan.</small> : <small>Preview the route to build stop windows.</small>}</section>
        </aside>
        <div className="map-canvas route-preview-canvas">
          <GoogleRouteMap apiKey={publicEnv.googleMapsBrowserKey} mapId={publicEnv.googleMapId} onMapClick={addMapPoint} onPointMoved={moveMapPoint} points={points.flatMap((point, index) => typeof point.latitude === 'number' && typeof point.longitude === 'number' ? [{ ...point, latitude: point.latitude, longitude: point.longitude, ordinal: index + 1 }] : [])} routePoints={plottedPoints} showTraffic={showTraffic} />
          <div className="map-route-summary">
            <div><p className="kicker">{preview ? 'ROAD SHAPE PREVIEW' : 'MULTI-POINT ROUTE BUILDER'}</p>
              <strong>{preview ? `${miles(preview.distanceMeters)} · ${rideTime(preview.durationSeconds)}` : 'Set Start and Finish, then add the points that make this your ride. Drag the grip beside a waypoint and the map updates to match.'}</strong>
              <small className="route-key"><i className="stop-key" /> Stop = pull over <i className="via-key" /> Pass-through = keep rolling</small>
            </div>
            <div className="route-tools" aria-label="Route tools">
              <label className="map-toggle"><input checked={showTraffic} onChange={(event) => setShowTraffic(event.target.checked)} type="checkbox" /> Traffic <small>live road flow</small></label>
              <button className="secondary-button weather-button" disabled={!preview || busy !== null} onClick={() => void runWeather()} title={preview ? 'Show weather at the start, midpoint, and finish' : 'Preview the route first so KSU can check conditions along the actual road'} type="button">{busy === 'weather' ? 'Checking…' : weather ? 'Refresh weather' : 'Weather along route'}</button>
            </div>
            <div className="map-point-picker" aria-label="Choose the type of next map pin">
              <span>Next map pin</span>
              <button aria-pressed={mapPointKind === 'via'} className={mapPointKind === 'via' ? 'selected' : ''} onClick={() => setMapPointKind('via')} type="button">Pass-through <small>shape the road</small></button>
              <button aria-pressed={mapPointKind === 'stop'} className={mapPointKind === 'stop' ? 'selected' : ''} onClick={() => setMapPointKind('stop')} type="button">Stop <small>pull over</small></button>
            </div>
            {handoff ? <a className="secondary-button" href={handoff.url} rel="noreferrer" target="_blank">Open in Google Maps</a> : null}
          </div>
        </div>
      </div>
      {weather ? <section className="route-weather" aria-labelledby="route-weather-title">
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
