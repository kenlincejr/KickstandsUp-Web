import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import {
  decodePolyline,
  isCompleteDefinition,
  previewRoute,
  resolvePlace,
  saveRoute,
  searchPlaces,
  type PlaceSuggestion,
  type PlannerWaypoint,
  type RouteDefinition,
  type RoutePreview,
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

function toPlot(points: { latitude: number; longitude: number }[]) {
  if (!points.length) return '';
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = Math.max(.0001, maxLat - minLat);
  const lngRange = Math.max(.0001, maxLng - minLng);
  return points.map((point) => {
    const x = 8 + ((point.longitude - minLng) / lngRange) * 84;
    const y = 92 - ((point.latitude - minLat) / latRange) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function RoutePlannerPage() {
  const [title, setTitle] = useState('My next ride');
  const [points, setPoints] = useState<DraftPoint[]>([blankPoint('origin'), blankPoint('destination')]);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);
  const [searchingPointId, setSearchingPointId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState<'preview' | 'save' | 'place' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [saved, setSaved] = useState<SavedRevision | null>(null);
  const [routePlanId, setRoutePlanId] = useState<string | undefined>();
  const placeSession = useRef(crypto.randomUUID());

  const definition = useMemo<RouteDefinition | null>(() => {
    const resolved = points.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.source && point.coordinateProvenance);
    if (!resolved) return null;
    return {
      title: title.trim() || 'Untitled route', avoidHighways, avoidTolls, avoidFerries,
      waypoints: points.map(({ id: _id, ...point }) => point as PlannerWaypoint),
    };
  }, [avoidFerries, avoidHighways, avoidTolls, points, title]);

  const activeSearch = points.find((point) => point.id === searchingPointId);
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

  const markChanged = () => {
    setPreview(null);
    setSaved(null);
    setError(null);
  };

  const updatePointQuery = (id: string, displayName: string) => {
    markChanged();
    setSearchingPointId(id);
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

  const addStop = () => {
    markChanged();
    setPoints((current) => [...current.slice(0, -1), blankPoint('stop'), current.at(-1)!]);
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
      setError('Choose a start and finish from the search results before previewing.');
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

  const plottedPoints = preview ? decodePolyline(preview.encodedPolyline) : definition?.waypoints ?? [];
  const plot = toPlot(plottedPoints);
  const handoff = definition ? buildGoogleMapsHandoffs(definition.waypoints)[0] : null;

  return (
    <section className="tool-page planner-page">
      <header className="tool-header">
        <div><p className="kicker">KSU ROUTE LAB</p><h1>Build the ride. Keep the route.</h1><p>Search real places, preview the road, then save an immutable KSU revision.</p></div>
        <div className="button-row">
          <button className="secondary-button" disabled={!preview || busy !== null} onClick={() => void runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button>
          <button className="primary-button" disabled={!definition || busy !== null} onClick={() => void runPreview()} type="button">{busy === 'preview' ? 'Calculating…' : preview ? 'Refresh preview' : 'Preview route'}</button>
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
          <ol className="planner-stop-list">
            {points.map((point, index) => <li key={point.id}>
              <div className="stop-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="stop-editor">
                <label><span>{point.kind === 'origin' ? 'START' : point.kind === 'destination' ? 'FINISH' : point.kind.toUpperCase()}</span><input autoComplete="off" onChange={(event) => updatePointQuery(point.id, event.target.value)} onFocus={() => setSearchingPointId(point.id)} placeholder={point.kind === 'origin' ? 'Search starting place' : point.kind === 'destination' ? 'Search destination' : 'Search waypoint'} value={point.displayName} /></label>
                {searchingPointId === point.id && suggestions.length ? <div className="place-results">{suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void choosePlace(point.id, suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
                {Number.isFinite(point.latitude) ? <small className="resolved-place">Ready · {point.latitude!.toFixed(4)}, {point.longitude!.toFixed(4)}</small> : null}
              </div>
              <div className="stop-actions">
                {index > 0 && index < points.length - 1 ? <>
                  <button aria-label="Move waypoint up" disabled={index === 1} onClick={() => movePoint(index, -1)} type="button">↑</button>
                  <button aria-label="Move waypoint down" disabled={index === points.length - 2} onClick={() => movePoint(index, 1)} type="button">↓</button>
                  <button aria-label="Remove waypoint" onClick={() => { markChanged(); setPoints((current) => current.filter((item) => item.id !== point.id)); }} type="button">×</button>
                </> : null}
              </div>
            </li>)}
          </ol>
          <button className="add-stop" disabled={points.length >= 27} onClick={addStop} type="button">+ Add waypoint</button>
          <fieldset className="route-options"><legend>Road preferences</legend>
            <label><input checked={avoidHighways} onChange={(event) => { markChanged(); setAvoidHighways(event.target.checked); }} type="checkbox" /> Avoid highways</label>
            <label><input checked={avoidTolls} onChange={(event) => { markChanged(); setAvoidTolls(event.target.checked); }} type="checkbox" /> Avoid tolls</label>
            <label><input checked={avoidFerries} onChange={(event) => { markChanged(); setAvoidFerries(event.target.checked); }} type="checkbox" /> Avoid ferries</label>
          </fieldset>
        </aside>
        <div className="map-canvas route-preview-canvas">
          {plot ? <div className="route-plot-card">
            <div><p className="kicker">ROAD SHAPE PREVIEW</p><h2>{preview ? title : 'Choose your endpoints.'}</h2><p>{preview ? `${miles(preview.distanceMeters)} · ${rideTime(preview.durationSeconds)} · ${preview.cacheHit ? 'cached preview' : 'calculated now'}` : 'The line will update when each place is resolved. Preview uses Google Routes; your ordered stops remain KSU data.'}</p></div>
            <svg aria-label="Route shape" preserveAspectRatio="xMidYMid meet" role="img" viewBox="0 0 100 100"><polyline points={plot} /></svg>
            <div className="route-preview-actions">
              <span>Route preview powered by Google</span>
              {handoff ? <a className="secondary-button" href={handoff.url} rel="noreferrer" target="_blank">Open in Google Maps</a> : null}
            </div>
          </div> : <div className="map-placeholder"><p className="kicker">REAL ROUTE WORKSPACE</p><h2>Start with two places.</h2><p>Search for a staging point and destination. Add up to 25 ordered stops, preview the ride, and save it to your KSU roadbook.</p></div>}
        </div>
      </div>
      {busy === 'place' ? <div className="planner-busy" aria-live="polite">Resolving place…</div> : null}
    </section>
  );
}
