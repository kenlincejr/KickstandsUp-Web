import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice, RibbonRule, Select, StampChip, TextInput, Toggle } from '../design/day-kit';
import { RouteMapPalette } from './route-map-palette';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import { GoogleRouteMap } from './google-route-map';
import { mapMarkersFor } from './route-leg-editor-core';
import { routePointIdentity } from './route-point-identity';
import { RouteLegEditor } from './route-leg-editor';
import { useRouteLegEditor } from './use-route-leg-editor';
import { plannerGuideSteps, plannerGuideStorageKey, shouldShowPlannerGuide } from './planner-onboarding';
import { nextPlannerAction } from './planner-post-preview';
import { fuelPlanForBike, manualPlannerFuelPlan, plannerFuelSourceLabel, type PlannerFuelPlan, type PlannerGarageBike } from './planner-fuel-plan';
import { listPlannerGarage } from './planner-garage-repository';
import { publicEnv } from '../lib/env';
import {
  decodePolyline,
  getRouteWeather,
  type RouteWeatherResponse,
} from './route-planner-repository';

function miles(meters: number) {
  return `${Math.round(meters / 1609.344)} mi`;
}

function rideTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function RoutePlannerPage() {
  const [fuelRangeMiles, setFuelRangeMiles] = useState('150');
  const [fuelReservePercent, setFuelReservePercent] = useState('20');
  const [garage, setGarage] = useState<PlannerGarageBike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState('manual');
  const [fuelSource, setFuelSource] = useState<PlannerFuelPlan['source']>('manual');
  const [showTraffic, setShowTraffic] = useState(false);
  const [showPlanningGuide, setShowPlanningGuide] = useState(true);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weather, setWeather] = useState<RouteWeatherResponse | null>(null);
  const plannerRef = useRef<HTMLElement>(null);
  const weatherRef = useRef<HTMLElement>(null);

  const fuelPlanSnapshot = useMemo(() => {
    const selectedBike = garage.find((bike) => bike.id === selectedBikeId);
    if (selectedBike && fuelSource === 'bike_band_estimate') return fuelPlanForBike(selectedBike, Number(fuelReservePercent));
    return manualPlannerFuelPlan(Number(fuelRangeMiles), Number(fuelReservePercent), fuelSource === 'route_override' ? 'route_override' : 'manual');
  }, [fuelRangeMiles, fuelReservePercent, fuelSource, garage, selectedBikeId]);

  const editor = useRouteLegEditor({
    maxPoints: 27,
    fuelPlan: fuelPlanSnapshot,
    instanceId: 'planner',
    onEdited: () => setWeather(null),
  });
  const { draft, definition, actions, firstIncomplete, previewReady, freshPreview, previewMessage } = editor;
  const { points, title, preview, previewStale, saved } = { points: draft.points, title: draft.title, preview: draft.preview ?? null, previewStale: draft.previewStale, saved: draft.saved ?? null };
  const busy: 'preview' | 'save' | 'place' | 'weather' | null = editor.busy ?? (weatherBusy ? 'weather' : null);
  const error = editor.error ?? editor.hint;

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

  useEffect(() => {
    if (weather) weatherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [weather]);

  const addFuelStop = (mile: number) => {
    actions.addIntermediate('stop');
    actions.setHint(`Fuel window near mile ${mile}: choose the actual stop by searching or placing this Stop here point on the map.`);
  };

  const dismissPlanningGuide = () => {
    window.localStorage.setItem(plannerGuideStorageKey, 'dismissed');
    setShowPlanningGuide(false);
  };

  const restorePlanningGuide = () => {
    window.localStorage.removeItem(plannerGuideStorageKey);
    setShowPlanningGuide(true);
  };

  const runWeather = async () => {
    if (!preview || previewStale) return;
    setWeatherBusy(true);
    actions.setError(null);
    try {
      setWeather(await getRouteWeather(preview));
    } catch (reason) {
      setWeather(null);
      actions.setError(reason instanceof Error ? reason.message : 'Weather conditions are temporarily unavailable. Your route is still ready.');
      window.requestAnimationFrame(() => plannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } finally {
      setWeatherBusy(false);
    }
  };

  const clearRoute = () => {
    if (!window.confirm('Clear this route and start over? This removes the unsaved waypoints, road preferences, and preview. Saved routes stay in My Routes.')) return;
    editor.clear();
    setShowTraffic(false);
    setWeather(null);
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
          <button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void editor.runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button>
          <button className="primary-button" disabled={busy !== null} onClick={() => void editor.runPreview()} type="button">{busy === 'preview' ? 'Calculating…' : previewStale ? 'Preview updated route' : preview ? 'Refresh preview' : previewReady ? 'Preview route' : firstIncomplete ? `Finish ${firstIncomplete.identity.token} to preview` : 'Finish route to preview'}</button>
          </div>
          <details className="planner-help-menu">
            <summary>Planning help</summary>
            <p>Need a quick reset? The guide shows the rider-safe planning flow without clearing your route.</p>
            <button className="text-button" onClick={restorePlanningGuide} type="button">Show planning guide</button>
          </details>
        </div>
      </header>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Route saved to My routes. <Link to={`/app/routes/${saved.routePlanId}`}>Open saved route →</Link></Notice> : null}
      {showPlanningGuide ? <section className="planner-guide" aria-labelledby="planner-guide-title">
        <div><p className="kicker">PLAN THIS RIDE</p><h2 id="planner-guide-title">Three moves. No mystery waypoint.</h2></div>
        <ol>{plannerGuideSteps.map((step, index) => <li key={step.title}><b>{index + 1}</b><span><strong>{step.title}</strong><small>{step.detail}</small></span></li>)}</ol>
        <button className="text-button" onClick={dismissPlanningGuide} type="button">Got it — hide guide</button>
      </section> : null}
      <div className="planner-grid">
        <aside className="planner-panel">
          <TextInput label="Route name" maxLength={120} onChange={(event) => actions.setTitle(event.target.value)} value={title} />
          <div className="metric-row">
            <span><b>{preview ? miles(preview.distanceMeters) : '—'}</b> distance</span>
            <span><b>{preview ? rideTime(preview.durationSeconds) : '—'}</b> saddle</span>
            <span><b>{points.length}</b> points</span>
          </div>
          <RouteLegEditor editor={editor} roadPreferenceExtras={<Toggle checked={showTraffic} label="Show live traffic" onChange={setShowTraffic} />} />
          <section className="smart-stops" aria-labelledby="smart-stops-title">
            <RibbonRule label="Smart stops" />
            <h2 id="smart-stops-title">Fuel and crew-break windows.</h2>
            <p>Set the range you trust, not the number printed in a brochure. KSU plans the window; you choose the actual stop.</p>
            {garage.length ? (
              <Select
                label="Ride this bike"
                onChange={(value) => {
                  const bike = garage.find((candidate) => candidate.id === value);
                  const plan = bike && fuelPlanForBike(bike, Number(fuelReservePercent));
                  setSelectedBikeId(value);
                  if (plan) { setFuelRangeMiles(String(plan.rangeMiles)); setFuelSource(plan.source); }
                }}
                options={[{ value: 'manual', label: 'Use a route-only plan' }, ...garage.map((bike) => ({ value: bike.id, label: `${bike.label}${bike.isActive ? ' (active)' : ''}` }))]}
                value={selectedBikeId}
              />
            ) : <small className="ksu-field-hint">No garage bike is required. Use a range you trust for this ride.</small>}
            <small className="point-purpose">{fuelPlanSnapshot ? plannerFuelSourceLabel(fuelPlanSnapshot.source) : 'Enter a comfortable range between 40 and 400 miles.'}{fuelPlanSnapshot?.bikeLabel ? ` · ${fuelPlanSnapshot.bikeLabel}` : ''}. This stays private to you.</small>
            <div className="ksu-field-grid">
              <TextInput inputMode="numeric" label="Comfortable range" onChange={(event) => { setFuelRangeMiles(event.target.value.replace(/\D/g, '').slice(0, 3)); setFuelSource(selectedBikeId === 'manual' ? 'manual' : 'route_override'); }} suffix="mi" value={fuelRangeMiles} />
              <TextInput inputMode="numeric" label="Keep in reserve" onChange={(event) => { setFuelReservePercent(event.target.value.replace(/\D/g, '').slice(0, 2)); setFuelSource(selectedBikeId === 'manual' ? 'manual' : 'route_override'); }} suffix="%" value={fuelReservePercent} />
            </div>
            {smartStops ? smartStops.length ? (
              <ol className="smart-stop-list">
                {smartStops.map((mile, index) => (
                  <li key={mile}>
                    <StampChip label={`Fuel window ${index + 1}`} tone="brass" />
                    <span>Start looking near mile {Math.max(1, mile - 15)} · aim to fuel by mile {mile}</span>
                    <button className="text-button" disabled={points.length >= 27} onClick={() => addFuelStop(mile)} type="button">Add fuel stop near this window</button>
                  </li>
                ))}
              </ol>
            ) : <small>This ride fits inside your current range plan.</small> : <small>Preview the route to build stop windows.</small>}
          </section>
        </aside>
        <div className="map-canvas route-preview-canvas ksu-map-frame">
          <GoogleRouteMap apiKey={publicEnv.googleMapsBrowserKey} mapId={publicEnv.googleMapId} onMapClick={actions.addMapPoint} onPointMoved={actions.moveMapPoint} onPointSelected={actions.selectPoint} points={mapMarkersFor(points, editor.selectedPointId)} routePoints={plottedPoints} selectedPointId={editor.selectedPointId} showTraffic={showTraffic} />
          <RouteMapPalette clearLabel="Clear" editor={editor} onClear={clearRoute} />
        </div>
      </div>
      <section className="planner-action-rail" aria-labelledby="planner-action-rail-title">
        <header><div><p className="kicker">NEXT RIDER JOB</p><h2 id="planner-action-rail-title">{freshPreview ? 'Route is fresh. Keep the plan honest.' : 'Preview the route before downstream actions.'}</h2></div><p className={`route-freshness ${freshPreview ? 'fresh' : 'stale'}`}>{freshPreview ? `Fresh route preview · calculated ${formatTimestamp(preview!.calculatedAt)} · valid until ${formatTimestamp(preview!.expiresAt)}` : preview ? 'Route changed after preview · conditions, save, and handoff are paused.' : 'No route preview yet.'}</p></header>
        <div className="planner-action-grid">
          <article className={nextAction === 'review' ? 'primary' : ''}><span>1</span><h3>Review the road</h3><p>{freshPreview ? `${miles(preview!.distanceMeters)} · ${rideTime(preview!.durationSeconds)} · ${points.length} route points.` : 'Preview the current itinerary to calculate distance, time, and a fresh road shape.'}</p><button className="secondary-button" disabled={!previewReady || busy !== null} onClick={() => void editor.runPreview()} type="button">{previewStale ? 'Preview updated route' : 'Review route preview'}</button></article>
          <article><span>2</span><h3>Plan fuel & stops</h3><p>{smartStops?.length ? `${smartStops.length} fuel window${smartStops.length === 1 ? '' : 's'} are ready above. Choose each actual stop yourself.` : 'Fuel windows appear after a route preview; KSU never inserts a business for you.'}</p><button className="text-button" onClick={() => document.getElementById('smart-stops-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} type="button">Review fuel plan</button></article>
          <article className={nextAction === 'conditions' ? 'primary' : ''}><span>3</span><h3>Check conditions</h3><p>{weather ? `Conditions checked ${formatTimestamp(weather.generatedAt)}. They are planning signals, not a safety guarantee.` : 'Check Start, Mid-route, and Finish only after a fresh preview.'}</p><button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void runWeather()} type="button">{busy === 'weather' ? 'Checking conditions…' : weather ? 'Refresh conditions' : 'Check route conditions'}</button></article>
          <article className={nextAction === 'save' ? 'primary' : ''}><span>4</span><h3>Save route</h3><p>{saved ? `Saved as revision ${saved.revisionNumber}. Editing the draft will create the next immutable revision.` : 'Saving creates a private, editable KSU route revision. It does not publish or share it.'}</p><button className="secondary-button" disabled={!freshPreview || busy !== null} onClick={() => void editor.runSave()} type="button">{busy === 'save' ? 'Saving…' : saved ? `Saved revision ${saved.revisionNumber}` : 'Save route'}</button></article>
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
