import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicEnv } from '../lib/env';
import { GoogleRouteMap } from './google-route-map';
import { riderCopyForTripError } from './trip-errors';
import { createTripRide } from './trip-repository';
import { searchPlaces, resolvePlace, type PlaceSuggestion } from './route-planner-repository';
import type { TripRpcError } from './trip-repository';
import { useCapabilities } from './capability-context';

const paceOptions = ['Chill', 'Steady', 'Spirited'];
const bikeFitOptions = ['All bikes welcome', 'Cruisers', 'Sport bikes', 'ADV / dual-sport', 'Touring', 'Scooters / small displacement'];
const experienceFitOptions = ['All experience levels', 'New rider friendly', 'Comfortable beginner', 'Intermediate', 'Advanced only'];
const rideStyleOptions = ['Scenic', 'Twisties', 'Highway cruise', 'Coffee run', 'Dinner ride', 'Bike night', 'Charity / event', 'Off-pavement', 'Training / new-rider friendly'];

type StagingPin = {
  displayName: string;
  address: string;
  latitude: number;
  longitude: number;
  providerPlaceId: string | null;
  source: 'place_search' | 'dropped_pin';
};

function toIso(local: string): string | null {
  if (!local.trim()) return null;
  const parsed = new Date(local);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function spanDays(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const span = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(span) || span <= 0) return null;
  return Math.max(1, Math.ceil(span / 86_400_000));
}

export function TripCreatePage() {
  const navigate = useNavigate();
  const { snapshot } = useCapabilities();
  const [title, setTitle] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [departureLabel, setDepartureLabel] = useState('');
  const [staging, setStaging] = useState<StagingPin | null>(null);
  const [stagingQuery, setStagingQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [pace, setPace] = useState('');
  const [bikeFit, setBikeFit] = useState('');
  const [experienceFit, setExperienceFit] = useState('');
  const [rideStyle, setRideStyle] = useState('');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [maxRiders, setMaxRiders] = useState('');
  const [notes, setNotes] = useState('');
  const [surfaceNotes, setSurfaceNotes] = useState('');
  const [logisticsNotes, setLogisticsNotes] = useState('');
  const [sweepLabel, setSweepLabel] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Idempotency: minted once per form mount, reused on every retry. A fresh
  // uuid per click creates duplicate trips; the delegate dedupes on this.
  const operationId = useRef(crypto.randomUUID());
  const placeSession = useRef(crypto.randomUUID());

  const startIso = useMemo(() => toIso(startLocal), [startLocal]);
  const endIso = useMemo(() => toIso(endLocal), [endLocal]);
  const days = spanDays(startIso, endIso);
  const datesValid = Boolean(startIso && endIso && Date.parse(endIso) > Date.parse(startIso) && Date.parse(endIso) <= Date.parse(startIso) + 30 * 86_400_000);

  useEffect(() => {
    if (staging || stagingQuery.trim().length < 3) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(stagingQuery.trim(), placeSession.current, controller.signal)
        .then(setSuggestions)
        .catch(() => undefined);
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stagingQuery, staging]);

  const chooseStaging = async (suggestion: PlaceSuggestion) => {
    setError(null);
    try {
      const place = await resolvePlace(suggestion.placeId, placeSession.current);
      setStaging({
        displayName: place.displayName,
        address: place.address ?? '',
        latitude: place.latitude,
        longitude: place.longitude,
        providerPlaceId: place.placeId,
        source: 'place_search',
      });
      setStagingQuery(place.address ? `${place.displayName} — ${place.address}` : place.displayName);
      setSuggestions([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not use that place.');
    }
  };

  const dropStagingPin = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    setStaging({ displayName: label, address: '', latitude, longitude, providerPlaceId: null, source: 'dropped_pin' });
    setStagingQuery(label);
    setSuggestions([]);
  };

  const create = async () => {
    if (!title.trim()) { setError('Give the trip a name.'); return; }
    if (!startIso || !endIso) { setError('Pick a start and an end date.'); return; }
    if (Date.parse(endIso) <= Date.parse(startIso)) { setError('The end date has to be after the start date.'); return; }
    if (!datesValid) { setError('A trip can cover up to 30 days.'); return; }
    if (!staging) { setError('Pick where the trip starts — search a place or drop a pin on the map.'); return; }
    setBusy(true);
    setError(null);
    try {
      const rideId = await createTripRide({
        operationId: operationId.current,
        departureAt: startIso,
        expectedEndAt: endIso,
        departureLabel: departureLabel.trim() || `Rolling ${new Date(startIso).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}`,
        title: title.trim(),
        pace: pace || null,
        bikeFit: bikeFit || null,
        experienceFit: experienceFit || null,
        rideStyle: rideStyle || null,
        chatEnabled,
        maxRiders: maxRiders.trim() ? Number(maxRiders) : null,
        notes: notes.trim() || null,
        surfaceNotes: surfaceNotes.trim() || null,
        logisticsNotes: logisticsNotes.trim() || null,
        sweepLabel: sweepLabel.trim() || null,
        stagingDisplayName: staging.displayName,
        stagingAddress: staging.address,
        stagingLatitude: staging.latitude,
        stagingLongitude: staging.longitude,
        stagingProviderPlaceId: staging.providerPlaceId,
        stagingSource: staging.source,
        publicDescription: publicDescription.trim() || null,
      });
      operationId.current = crypto.randomUUID();
      navigate(`/app/trips/${rideId}`, { state: { justCreated: true } });
    } catch (reason) {
      const rpc = reason as TripRpcError;
      const copy = riderCopyForTripError(rpc.code, rpc.message);
      if (copy.contractDrift) console.error('[ksu] create_trip_ride 42501 with routes.plan.web granted — capability/entitlement drift', rpc.message);
      setError(copy.message);
    } finally {
      setBusy(false);
    }
  };

  // Creation is new paid work: it pauses whenever the access projection is
  // not fresh (reading existing trips stays open — that lives on other pages).
  if (snapshot.projectionState !== 'ready') {
    return (
      <section className="tool-page locked-feature">
        <p className="kicker">KSU TRIPS</p>
        <h1>{snapshot.projectionState === 'stale' ? 'Trip planning needs a fresh check.' : "We can't verify trip planning access."}</h1>
        <p>{snapshot.projectionState === 'stale'
          ? "Your last access check is stale, so new trips stay paused until KSU reconnects. Trips you've already published still show on riders' phones."
          : "KSU couldn't load your server access. Planning stays paused; nothing you've already saved or published is affected."}</p>
      </section>
    );
  }

  return (
    <section className="tool-page planner-page">
      <header className="tool-header">
        <div><p className="kicker">KSU TRIPS</p><h1>Start a multi-day trip.</h1><p>Dates and staging first. You add the day-by-day plan next — riders can already see the dates while you work.</p></div>
      </header>
      {error ? <div className="planner-notice error" role="alert">{error}</div> : null}
      <div className="planner-grid">
        <aside className="planner-panel">
          <label className="planner-title"><span>Trip name</span><input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Austin → Sturgis" value={title} /></label>
          <fieldset className="route-options"><legend>Dates</legend>
            <label><span>Rolling out</span><input onChange={(event) => setStartLocal(event.target.value)} type="datetime-local" value={startLocal} /></label>
            <label><span>Back home by</span><input onChange={(event) => setEndLocal(event.target.value)} type="datetime-local" value={endLocal} /></label>
            <small aria-live="polite">{days ? `${days} ${days === 1 ? 'day' : 'days'}${datesValid ? '' : ' — a trip can cover up to 30 days'}` : 'End strictly after start, within 30 days.'}</small>
            <label><span>Departure label (optional)</span><input maxLength={80} onChange={(event) => setDepartureLabel(event.target.value)} placeholder="Rolling Friday 7:00 AM" value={departureLabel} /></label>
          </fieldset>
          <fieldset className="route-options"><legend>Where it starts</legend>
            <label><span>Staging spot</span><input autoComplete="off" onChange={(event) => { setStaging(null); setStagingQuery(event.target.value); }} placeholder="Search the meet-up spot" value={stagingQuery} /></label>
            {suggestions.length ? <div className="place-results">{suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void chooseStaging(suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
            <small>{staging ? `Pinned · ${staging.latitude.toFixed(4)}, ${staging.longitude.toFixed(4)} — Day 1 navigation starts here.` : 'Search, or click the map to drop the pin. Day 1 navigation starts here.'}</small>
          </fieldset>
          <details className="route-options">
            <summary>Ride fields (optional)</summary>
            <label><span>Pace</span><select onChange={(event) => setPace(event.target.value)} value={pace}><option value="">Choose pace</option>{paceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label><span>Bike fit</span><select onChange={(event) => setBikeFit(event.target.value)} value={bikeFit}><option value="">Choose bike fit</option>{bikeFitOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label><span>Experience fit</span><select onChange={(event) => setExperienceFit(event.target.value)} value={experienceFit}><option value="">Choose experience fit</option>{experienceFitOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label><span>Ride style</span><select onChange={(event) => setRideStyle(event.target.value)} value={rideStyle}><option value="">Choose ride style</option>{rideStyleOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label><input checked={chatEnabled} onChange={(event) => setChatEnabled(event.target.checked)} type="checkbox" /> Ride chat on</label>
            <label><span>Max riders (optional)</span><input inputMode="numeric" onChange={(event) => setMaxRiders(event.target.value.replace(/\D/g, '').slice(0, 3))} value={maxRiders} /></label>
            <label><span>Notes</span><textarea maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
            <label><span>Surface notes</span><textarea maxLength={500} onChange={(event) => setSurfaceNotes(event.target.value)} value={surfaceNotes} /></label>
            <label><span>Logistics notes</span><textarea maxLength={500} onChange={(event) => setLogisticsNotes(event.target.value)} value={logisticsNotes} /></label>
            <label><span>Sweep label</span><input maxLength={80} onChange={(event) => setSweepLabel(event.target.value)} value={sweepLabel} /></label>
            <label><span>Public description</span><textarea maxLength={500} onChange={(event) => setPublicDescription(event.target.value)} value={publicDescription} /></label>
          </details>
          <button className="primary-button" disabled={busy} onClick={() => void create()} type="button">{busy ? 'Creating…' : 'Create the trip'}</button>
        </aside>
        <div className="map-canvas route-preview-canvas">
          <GoogleRouteMap
            apiKey={publicEnv.googleMapsBrowserKey}
            mapId={publicEnv.googleMapId}
            onMapClick={dropStagingPin}
            onPointMoved={(_id, coordinates) => dropStagingPin(coordinates)}
            onPointSelected={() => undefined}
            points={staging ? [{ id: 'staging', kind: 'origin', displayName: staging.displayName, latitude: staging.latitude, longitude: staging.longitude, token: 'S', purpose: 'Start', selected: true }] : []}
            routePoints={[]}
            selectedPointId={staging ? 'staging' : null}
            showTraffic={false}
          />
        </div>
      </div>
    </section>
  );
}
