import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Notice, RibbonRule, ScreenTitle, Select, StampChip, TextArea, TextInput, Toggle } from '../design/day-kit';
import { Toolbar, ToolbarAction } from '../design/control-language';
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

/** Ride fields are free text on the wire; the day-kit Select needs {value,label}. */
const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

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
  // Armed-placement latch: the map only accepts a click while this is true.
  const [placingPin, setPlacingPin] = useState(false);
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

  /**
   * Placement is ARMED, never ambient. A bare map click used to become the
   * staging pin outright, and because the map opens at zoom 4 (where a few
   * pixels is several hundred miles) one stray click — dismissing the date
   * picker, say — put the pin in the Gulf of Alaska and the camera then jumped
   * to zoom 12 on open ocean. This mirrors the app's planner, where you choose
   * START / STOP / RIDE THRU / FINISH before you place anything: intent first,
   * then the map click means something.
   */
  const dropStagingPin = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!placingPin) return;
    const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    setStaging({ displayName: label, address: '', latitude, longitude, providerPlaceId: null, source: 'dropped_pin' });
    setStagingQuery(label);
    setSuggestions([]);
    setPlacingPin(false);
  };

  /** Dragging the marker refines a pin the rider already placed on purpose, so it needs no arming. */
  const moveStagingPin = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    setStaging((current) => current && { ...current, displayName: label, latitude, longitude, providerPlaceId: null, source: 'dropped_pin' });
    setStagingQuery(label);
  };

  const clearStaging = () => {
    setStaging(null);
    setStagingQuery('');
    setSuggestions([]);
    setPlacingPin(false);
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
      <section className="tool-page ksu-day ksu-page">
        <ScreenTitle eyebrow="KSU Trips" title={snapshot.projectionState === 'stale' ? 'Trip planning needs a fresh check.' : "We can't verify trip planning access."}>
          {snapshot.projectionState === 'stale'
            ? "Your last access check is stale, so new trips stay paused until KSU reconnects. Trips you've already published still show on riders' phones."
            : "KSU couldn't load your server access. Planning stays paused; nothing you've already saved or published is affected."}
        </ScreenTitle>
      </section>
    );
  }

  return (
    <section className="ksu-day ksu-tool">
      {/* The app's planner header: exit left in ink, Bebas title centred, the
          one forward action right in brass. */}
      <Toolbar
        lead={<ToolbarAction onClick={() => navigate('/app/trips')} side="lead">Cancel</ToolbarAction>}
        meta={days ? `${days} ${days === 1 ? 'day' : 'days'}${datesValid ? '' : ' — a trip can cover up to 30 days'}` : undefined}
        title="Plan a trip"
        trail={<ToolbarAction disabled={busy} onClick={() => void create()} side="trail">{busy ? 'Creating…' : 'Create'}</ToolbarAction>}
      />
      <div className="ksu-tool-body">
        {error ? <div className="ksu-tool-notices"><Notice tone="error">{error}</Notice></div> : null}
        <div className="ksu-split">
          <aside className="ksu-split-panel">
            <ScreenTitle eyebrow="Start here" title="Dates and staging first.">
              You add the day-by-day plan next — riders can already see the dates while you work.
            </ScreenTitle>

            <TextInput label="Trip name" maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Austin → Sturgis" value={title} />

            <RibbonRule label="Dates" />
            <div className="ksu-field-grid">
              <TextInput label="Rolling out" onChange={(event) => setStartLocal(event.target.value)} type="datetime-local" value={startLocal} />
              <TextInput
                hint={!startIso || !endIso
                  ? undefined
                  : datesValid
                    ? `${days} ${days === 1 ? 'day' : 'days'}`
                    : Date.parse(endIso) <= Date.parse(startIso)
                      ? 'Back home has to be after rolling out.'
                      : 'A trip can cover up to 30 days.'}
                label="Back home by"
                onChange={(event) => setEndLocal(event.target.value)}
                type="datetime-local"
                value={endLocal}
              />
            </div>
            <TextInput hint="Shown on riders' cards instead of a raw timestamp." label="Departure label (optional)" maxLength={80} onChange={(event) => setDepartureLabel(event.target.value)} placeholder="Rolling Friday 7:00 AM" value={departureLabel} />

            <RibbonRule label="Where it starts" />
            <div className="ksu-place-field">
              <TextInput
                autoComplete="off"
                hint={staging
                  ? `Pinned · ${staging.latitude.toFixed(4)}, ${staging.longitude.toFixed(4)} — Day 1 navigation starts here. Drag the marker to nudge it.`
                  : placingPin
                    ? 'Click the map to set the staging spot.'
                    : 'Search for the meet-up spot, or use Drop the pin. Day 1 navigation starts here.'}
                label="Staging spot"
                onChange={(event) => { setStaging(null); setStagingQuery(event.target.value); }}
                placeholder="Search the meet-up spot"
                value={stagingQuery}
              />
              {suggestions.length ? (
                <div className="ksu-place-results">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion.placeId} onClick={() => void chooseStaging(suggestion)} type="button">
                      <b>{suggestion.primaryText}</b>
                      {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="ksu-staging-actions">
              {staging ? <StampChip label="Staging set" tone="moss" /> : <StampChip label={placingPin ? 'Click the map' : 'Staging needed'} tone={placingPin ? 'brass' : 'rust'} />}
              <Button
                aria-pressed={placingPin}
                onClick={() => setPlacingPin((armed) => !armed)}
                variant={placingPin ? 'primary' : 'secondary'}
              >
                {placingPin ? 'Cancel' : staging ? 'Move the pin' : 'Drop the pin'}
              </Button>
              {staging ? <Button onClick={clearStaging} variant="text">Clear</Button> : null}
            </div>

            <details className="ksu-disclosure">
              <summary>Ride fields (optional)</summary>
              <div className="ksu-disclosure-body">
                <Select label="Pace" onChange={setPace} options={asOptions(paceOptions)} placeholder="Choose pace" value={pace} />
                <Select label="Bike fit" onChange={setBikeFit} options={asOptions(bikeFitOptions)} placeholder="Choose bike fit" value={bikeFit} />
                <Select label="Experience fit" onChange={setExperienceFit} options={asOptions(experienceFitOptions)} placeholder="Choose experience fit" value={experienceFit} />
                <Select label="Ride style" onChange={setRideStyle} options={asOptions(rideStyleOptions)} placeholder="Choose ride style" value={rideStyle} />
                <Toggle checked={chatEnabled} hint="Riders can talk to each other on the ride card." label="Ride chat on" onChange={setChatEnabled} />
                <TextInput inputMode="numeric" label="Max riders (optional)" onChange={(event) => setMaxRiders(event.target.value.replace(/\D/g, '').slice(0, 3))} value={maxRiders} />
                <TextArea label="Notes" maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} />
                <TextArea label="Surface notes" maxLength={500} onChange={(event) => setSurfaceNotes(event.target.value)} value={surfaceNotes} />
                <TextArea label="Logistics notes" maxLength={500} onChange={(event) => setLogisticsNotes(event.target.value)} value={logisticsNotes} />
                <TextInput label="Sweep label" maxLength={80} onChange={(event) => setSweepLabel(event.target.value)} value={sweepLabel} />
                <TextArea label="Public description" maxLength={500} onChange={(event) => setPublicDescription(event.target.value)} value={publicDescription} />
              </div>
            </details>

            <Button block disabled={busy} onClick={() => void create()} variant="primary">{busy ? 'Creating…' : 'Create the trip'}</Button>
          </aside>
          <div className={placingPin ? 'ksu-map-frame is-placing' : 'ksu-map-frame'}>
            <GoogleRouteMap
              apiKey={publicEnv.googleMapsBrowserKey}
              mapId={publicEnv.googleMapId}
              onMapClick={dropStagingPin}
              onPointMoved={(_id, coordinates) => moveStagingPin(coordinates)}
              onPointSelected={() => undefined}
              points={staging ? [{ id: 'staging', kind: 'origin', displayName: staging.displayName, latitude: staging.latitude, longitude: staging.longitude, token: 'S', purpose: 'Start', selected: true }] : []}
              routePoints={[]}
              selectedPointId={staging ? 'staging' : null}
              showTraffic={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
