import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { hasAccountCapability } from '@ksu/contracts';
import { Button, Notice, RibbonRule, ScreenTitle, StampChip, TextArea, TextInput, Toggle, buttonClass } from '../design/day-kit';
import { SummaryBar, Toolbar, ToolbarAction } from '../design/control-language';
import { RouteMapPalette } from './route-map-palette';
import { publicEnv } from '../lib/env';
import { GoogleRouteMap } from './google-route-map';
import { createRouteLegDraft, mapMarkersFor, type RouteLegDraft } from './route-leg-editor-core';
import { RouteLegEditor } from './route-leg-editor';
import { useRouteLegEditor } from './use-route-leg-editor';
import { decodePolyline } from './route-planner-repository';
import { useCapabilities } from './capability-context';
import { riderCopyForTripError } from './trip-errors';
import { tripLegOrigin } from './trip-origin';
import { AutopilotPanel } from './autopilot/autopilot-panel';
import { shouldOpenPendingLodgingFocus } from './autopilot/lodging-focus';
import {
  buildSetTripLegsPayload,
  dayForPayload,
  dayStopsFromPoints,
  fromLocalInput,
  legToDay,
  toLocalInput,
  validateTripDays,
  TRIP_LIMITS,
  type TripDayDraft,
  type TripDayIssue,
  type TripDraftPoint,
} from './trip-payload';
import { useAuth } from './auth/auth-context';
import { setNavigationGuard } from './navigation-guard';
import { supabase } from '../lib/supabase';
import {
  getRideTrip,
  getTripRideMeta,
  setTripDates,
  setTripLegs,
  tripDayHeading,
  tripLegDistanceLabel,
  tripLegOvernightLabel,
  tripLegRouteLabel,
  tripTotalMiles,
  type Trip,
  type TripLeg,
  type TripRpcError,
} from './trip-repository';

/** Two full preview passes over a six-day trip; a courtesy ceiling, not enforcement. */
const SESSION_PREVIEW_BUDGET = 12;

/** Minute-precision normalization so dirty-tracking compares like with like:
 * the server returns "+00:00"-style offsets, the date inputs round-trip
 * through datetime-local, and raw string comparison would flag every loaded
 * trip as dirty forever. */
function normalizedIso(iso: string): string {
  return fromLocalInput(toLocalInput(iso));
}

function summaryLeg(day: TripDayDraft, index: number): TripLeg {
  const stops = day.restDay ? [] : dayStopsFromPoints(day.leg.points);
  const preview = !day.restDay && day.leg.preview && !day.leg.previewStale ? day.leg.preview : null;
  return {
    id: day.id,
    dayIndex: index,
    title: day.title.trim() || undefined,
    departAt: day.departAt,
    arriveBy: day.arriveBy || undefined,
    plannedDistanceMeters: preview ? Math.round(preview.distanceMeters) : day.plannedDistanceMeters,
    plannedDurationSeconds: preview ? Math.round(preview.durationSeconds) : day.plannedDurationSeconds,
    stops: stops.map((stop) => ({ ...stop, stopId: stop.stopId ?? '' })),
    lodgingName: day.lodgingName.trim() || undefined,
    lodgingAddress: day.lodgingAddress.trim() || undefined,
    bookingUrl: day.bookingUrl.trim() || undefined,
    checkInAt: day.checkInAt ? fromLocalInput(day.checkInAt) : undefined,
    checkOutAt: day.checkOutAt ? fromLocalInput(day.checkOutAt) : undefined,
    notes: day.notes.trim() || undefined,
  };
}

export function TripEditorPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { snapshot } = useCapabilities();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [meta, setMeta] = useState<{ title: string; status: string; staging: { latitude: number; longitude: number } | null; stagingName: string | null; createdBy: string | null } | null>(null);
  const [days, setDays] = useState<TripDayDraft[]>([]);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [serverState, setServerState] = useState('');
  const [issues, setIssues] = useState<TripDayIssue[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    location.state && (location.state as { justCreated?: boolean }).justCreated
      ? 'Trip created. It has no days yet. Riders can already see the dates — add the days and they’ll appear on everyone’s phone.'
      : null,
  );
  const [loading, setLoading] = useState(true);
  const [savingTrip, setSavingTrip] = useState(false);
  const [terminalLock, setTerminalLock] = useState(false);
  const [previewsUsed, setPreviewsUsed] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);
  // Autopilot's "Find lodging near X" CTA (spec §3.2c) accepts the plan (if
  // not already accepted) and focuses the named day's OWN lodging fields —
  // it never writes a lodging value itself, only a placeholder hint.
  // `pendingLodgingFocus` is transient (one-shot — see the effect below);
  // `lodgingPlaceholder` is the persistent display hint for that day's
  // lodging-name input, kept separate so clearing the former doesn't blank
  // the hint the instant the day opens.
  const [pendingLodgingFocus, setPendingLodgingFocus] = useState<{ dayId: string; placeName: string } | null>(null);
  const [lodgingPlaceholder, setLodgingPlaceholder] = useState<{ dayId: string; placeName: string } | null>(null);

  // Editing pauses on a stale/unavailable projection; reading never does.
  const projectionEditable = snapshot.projectionState === 'ready';
  const statusEditable = meta ? meta.status === 'scheduled' || meta.status === 'forming' : true;
  // Only the coordinator edits — a joined rider gets the read surface, never a
  // form that 42501s at the last click. Fails CLOSED: no meta, no created_by,
  // or no session user all read as not-coordinator; the server still enforces.
  const isCoordinator = Boolean(meta?.createdBy && user?.id && meta.createdBy === user.id);
  const editable = projectionEditable && statusEditable && !terminalLock && isCoordinator;

  const openIndex = days.findIndex((day) => day.id === openDayId);
  const openDay = openIndex >= 0 ? days[openIndex] : null;

  const editor = useRouteLegEditor({
    // A trip day's identity plan caps at 6 counting stops and vias together
    // (ride_trip_legs_stops_count); every editor point becomes a wire stop.
    maxPoints: TRIP_LIMITS.maxStopsPerDay,
    fuelPlan: null,
    instanceId: 'trip-day',
  });
  const editorDayRef = useRef<string | null>(null);

  // Mirror every editor change into the open day so the day list, validation
  // and save always read current state.
  useEffect(() => {
    const dayId = editorDayRef.current;
    if (!dayId) return;
    setDays((current) => current.map((day) => day.id === dayId ? { ...day, leg: editor.draft as TripDayDraft['leg'] } : day));
  }, [editor.draft]);

  useEffect(() => {
    const remaining = editor.draft.preview?.dailyRemaining;
    if (typeof remaining === 'number') setDailyRemaining(remaining);
  }, [editor.draft.preview]);

  const loadTrip = useCallback(async () => {
    if (!rideId) return;
    setLoading(true);
    setPageError(null);
    try {
      const [loaded, rideMeta] = await Promise.all([getRideTrip(rideId), getTripRideMeta(rideId)]);
      if (!loaded) {
        setPageError('This ride isn’t a multi-day trip.');
        setTrip(null);
        return;
      }
      setTrip(loaded);
      setMeta(rideMeta ? {
        title: rideMeta.title,
        status: rideMeta.status,
        staging: rideMeta.stagingLatitude !== null && rideMeta.stagingLongitude !== null ? { latitude: rideMeta.stagingLatitude, longitude: rideMeta.stagingLongitude } : null,
        stagingName: rideMeta.stagingDisplayName,
        createdBy: rideMeta.createdBy,
      } : null);
      const loadedDays = loaded.legs.map(legToDay);
      setDays(loadedDays);
      setStartLocal(toLocalInput(loaded.departureAt));
      setEndLocal(toLocalInput(loaded.expectedEndAt));
      setServerState(JSON.stringify({ start: normalizedIso(loaded.departureAt), end: normalizedIso(loaded.expectedEndAt), legs: buildSetTripLegsPayload(loadedDays.map(dayForPayload)) }));
      setOpenDayId(null);
      editorDayRef.current = null;
      setIssues([]);
    } catch (reason) {
      const rpc = reason as TripRpcError;
      setPageError(riderCopyForTripError(rpc.code, rpc.message).message);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => { void loadTrip(); }, [loadTrip]);

  const currentStart = startLocal ? fromLocalInput(startLocal) : trip?.departureAt ?? '';
  const currentEnd = endLocal ? fromLocalInput(endLocal) : trip?.expectedEndAt ?? '';

  const localState = useMemo(() => {
    if (!trip) return '';
    try {
      return JSON.stringify({ start: currentStart, end: currentEnd, legs: buildSetTripLegsPayload(days.map(dayForPayload)) });
    } catch {
      return 'invalid';
    }
  }, [trip, days, currentStart, currentEnd]);
  const dirty = Boolean(trip) && localState !== serverState;

  // A leader who spends forty minutes planning six days and loses it to a
  // closed tab or a nav click will not come back. beforeunload covers the tab;
  // the navigation-guard registry covers the AppShell's own links.
  useEffect(() => {
    setNavigationGuard(dirty ? 'Leave without saving? Your unsaved day plan will be lost.' : null);
    if (!dirty) return () => setNavigationGuard(null);
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => { window.removeEventListener('beforeunload', guard); setNavigationGuard(null); };
  }, [dirty]);

  const openDayEditor = (dayId: string) => {
    // Never re-point the editor while a preview/save is in flight — the epoch
    // guard would discard the result, but the click order should not race it.
    if (editor.busy !== null) return;
    // Already open on this exact day — bail rather than re-call
    // editor.replaceDraft with a fresh object. This is MUST-FIX 1(b) from the
    // 2026-07-27 gate review: replaceDraft changes editor.draft, a mirror
    // effect below writes that back into `days` as a new array/object
    // reference, and anything that re-runs off a `days` change (like the
    // pending-lodging-focus effect just below) would otherwise call back in
    // here and loop forever. See lodging-focus.ts's header comment for the
    // full traced cycle.
    if (openDayId === dayId) return;
    const target = days.find((day) => day.id === dayId);
    if (!target) return;
    setOpenDayId(dayId);
    editorDayRef.current = dayId;
    editor.replaceDraft({ ...target.leg } as RouteLegDraft);
  };

  const closeDayEditor = () => {
    if (editor.busy !== null) return;
    setOpenDayId(null);
    editorDayRef.current = null;
    setLodgingPlaceholder(null);
  };

  const patchDay = (dayId: string, patch: Partial<TripDayDraft>) => {
    setDays((current) => current.map((day) => day.id === dayId ? { ...day, ...patch } : day));
  };

  // Once the pending-focus day actually lands in `days`, open it — ONE SHOT.
  // MUST-FIX 1(a) from the 2026-07-27 gate review: `pendingLodgingFocus` is
  // now cleared the same tick it's consumed, via the pure
  // `shouldOpenPendingLodgingFocus` guard (lodging-focus.ts — see its header
  // comment for the full traced infinite-loop cycle this closes). Persistent
  // display state (the placeholder hint) lives separately in
  // `lodgingPlaceholder`, which is NOT cleared here, so the hint survives
  // after the one-shot open fires.
  useEffect(() => {
    if (shouldOpenPendingLodgingFocus(days, pendingLodgingFocus)) {
      openDayEditor(pendingLodgingFocus!.dayId);
      setPendingLodgingFocus(null);
    }
  }, [days, pendingLodgingFocus]);

  // Autopilot never writes days directly — this IS the "explicit confirm"
  // the spec requires (§6.1's placement rule): the rider tapped "Use these
  // days" (or the relaxed-plan equivalent) inside AutopilotPanel, and only
  // now does local `days` state change. set_trip_legs still is not called —
  // that only happens from the existing "Save the plan" button below.
  const acceptAutopilotDays = (drafts: TripDayDraft[], focus?: { dayIndex: number; placeName: string }) => {
    if (days.length && !window.confirm('Replace the current day list with Autopilot’s proposal? Your unsaved edits to the existing days will be lost.')) return;
    closeDayEditor();
    setDays(drafts);
    setNotice(null);
    const focusDraft = focus ? drafts[focus.dayIndex] : undefined;
    // pendingLodgingFocus drives the one-shot "open this day" effect above;
    // lodgingPlaceholder is the persistent hint shown on the lodging-name
    // input once that day is open (see the OVERNIGHT fieldset below).
    setPendingLodgingFocus(focusDraft ? { dayId: focusDraft.id, placeName: focus!.placeName } : null);
    setLodgingPlaceholder(focusDraft ? { dayId: focusDraft.id, placeName: focus!.placeName } : null);
  };

  const autopilotLodgingCta = (dayIndex: number, placeName: string, drafts: TripDayDraft[]) => {
    // Rider tapped the CTA on a proposal day that isn't in the editor's day
    // list yet — accept the plan first (the same explicit-confirm path as
    // "Use these days"), then focus that day once it exists.
    acceptAutopilotDays(drafts, { dayIndex, placeName });
  };

  const stagingOrigin = meta?.staging ?? null;

  const addDay = () => {
    const last = days.at(-1);
    const baseDepart = last && Number.isFinite(Date.parse(last.departAt))
      ? Date.parse(last.departAt) + 86_400_000
      : Date.parse(trip?.departureAt ?? '');
    const clamped = trip ? Math.min(Math.max(baseDepart, Date.parse(trip.departureAt)), Date.parse(trip.expectedEndAt)) : baseDepart;
    // Day N's origin comes from day N-1's finish — the last kind:'stop' with a
    // confirmed pin, walking back through vias and rest days; staging otherwise.
    const builtStops = days.map((day) => ({ stops: day.restDay ? [] : dayStopsFromPoints(day.leg.points) }));
    const seedCoordinates = tripLegOrigin(builtStops, days.length, stagingOrigin);
    let seed: TripDraftPoint | null = null;
    if (seedCoordinates) {
      const priorStop = [...days].reverse().flatMap((day) => day.restDay ? [] : [...day.leg.points].reverse())
        .find((point) => point.kind !== 'via' && point.latitude === seedCoordinates.latitude && point.longitude === seedCoordinates.longitude);
      seed = {
        id: crypto.randomUUID(),
        kind: 'origin',
        displayName: priorStop?.displayName ?? meta?.stagingName ?? `${seedCoordinates.latitude.toFixed(5)}, ${seedCoordinates.longitude.toFixed(5)}`,
        latitude: seedCoordinates.latitude,
        longitude: seedCoordinates.longitude,
        googlePlaceId: priorStop?.googlePlaceId,
        source: priorStop?.googlePlaceId ? 'google_place' : 'manual',
        coordinateProvenance: priorStop?.googlePlaceId ? 'google_places' : 'ksu_customer',
        address: priorStop?.address,
      };
    }
    const fresh: TripDayDraft = {
      id: crypto.randomUUID(),
      title: '',
      departAt: Number.isFinite(clamped) ? new Date(clamped).toISOString() : '',
      arriveBy: '',
      leg: {
        ...createRouteLegDraft({ title: 'Trip day' }),
        points: [
          seed ?? { id: crypto.randomUUID(), kind: 'origin', displayName: '' },
          { id: crypto.randomUUID(), kind: 'destination', displayName: '' },
        ],
      } as TripDayDraft['leg'],
      lodgingName: '',
      lodgingAddress: '',
      bookingUrl: '',
      checkInAt: '',
      checkOutAt: '',
      notes: '',
      restDay: false,
    };
    setDays((current) => [...current, fresh]);
    setNotice(null);
    openDayEditor(fresh.id);
  };

  const removeDay = (dayId: string) => {
    const target = days.find((day) => day.id === dayId);
    if (!target) return;
    if (!window.confirm('Remove this day? Its route work is discarded. Days after it renumber.')) return;
    if (openDayId === dayId) closeDayEditor();
    setDays((current) => current.filter((day) => day.id !== dayId));
  };

  const moveDay = (dayId: string, direction: -1 | 1) => {
    setDays((current) => {
      const index = current.findIndex((day) => day.id === dayId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const runDayPreview = async () => {
    if (previewsUsed >= SESSION_PREVIEW_BUDGET) {
      setPageError(`You've previewed this trip ${SESSION_PREVIEW_BUDGET} times in this session. Each preview is a paid road calculation — save the plan and come back if you need more.`);
      return;
    }
    setPageError(null);
    // Only a preview that actually landed draws the session budget.
    if (await editor.runPreview()) setPreviewsUsed((current) => current + 1);
  };

  const departuresOutOfOrder = useMemo(() => {
    for (let index = 1; index < days.length; index += 1) {
      const previous = Date.parse(days[index - 1].departAt);
      const current = Date.parse(days[index].departAt);
      if (Number.isFinite(previous) && Number.isFinite(current) && current < previous) return true;
    }
    return false;
  }, [days]);

  const saveTrip = async () => {
    if (!trip || !rideId) return;
    if (openDayId) closeDayEditor();
    const payloadDays = days.map(dayForPayload);
    const window_ = { departureAt: currentStart || trip.departureAt, expectedEndAt: currentEnd || trip.expectedEndAt };
    const found = validateTripDays(payloadDays, window_);
    setIssues(found);
    if (found.length) {
      const firstDay = [...payloadDays].sort((a, b) => Date.parse(a.departAt) - Date.parse(b.departAt))[found[0].dayNumber - 1];
      if (firstDay) openDayEditor(firstDay.id);
      return;
    }
    setSavingTrip(true);
    setPageError(null);
    setNotice(null);
    try {
      // Compare at the same minute precision the inputs round-trip through —
      // raw string comparison would re-fire set_trip_dates on every save.
      const datesChanged = window_.departureAt !== normalizedIso(trip.departureAt) || window_.expectedEndAt !== normalizedIso(trip.expectedEndAt);
      const writePlan = async () => {
        // Dates first: legs are validated against the ride's CURRENT dates.
        if (datesChanged) await setTripDates(rideId, window_.departureAt, window_.expectedEndAt);
        return setTripLegs(rideId, buildSetTripLegsPayload(payloadDays));
      };
      let count: number;
      try {
        count = await writePlan();
      } catch (firstFailure) {
        // An expired browser session gets one silent refresh-and-retry; the
        // leader's plan is still in local state either way.
        if ((firstFailure as TripRpcError).code !== '28000' || !supabase) throw firstFailure;
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw firstFailure;
        count = await writePlan();
      }
      // The refetch is not optional: the server truncates strings, and the only
      // way to show the leader what riders will actually see is to re-read it.
      await loadTrip();
      setNotice(`Saved. ${count} ${count === 1 ? 'day is' : 'days are'} live on every rider's card.`);
    } catch (reason) {
      const rpc = reason as TripRpcError;
      const copy = riderCopyForTripError(rpc.code, rpc.message, { dateRangeLabel: `${new Date(window_.departureAt).toLocaleDateString()} – ${new Date(window_.expectedEndAt).toLocaleDateString()}` });
      if (copy.clientBug) console.error('[ksu] trip save client bug', rpc.code, rpc.message);
      if (copy.terminal) setTerminalLock(true);
      // A failed set_trip_legs leaves the local itinerary untouched — the old
      // plan is intact on the server and the new one is intact right here.
      setPageError(copy.message);
      if (copy.dayNumber) {
        const target = [...days].sort((a, b) => Date.parse(a.departAt) - Date.parse(b.departAt))[copy.dayNumber - 1];
        if (target) openDayEditor(target.id);
      }
    } finally {
      setSavingTrip(false);
    }
  };

  if (loading) return <section className="tool-page ksu-day ksu-page">Loading the trip…</section>;
  if (pageError && !trip) {
    return (
      <section className="tool-page ksu-day ksu-page">
        <ScreenTitle eyebrow="KSU Trips" title={pageError} />
        <Link className={buttonClass('secondary')} to="/app/trips">Back to trips</Link>
      </section>
    );
  }
  if (!trip) return null;

  const summaries = days.map(summaryLeg);
  const totalMiles = tripTotalMiles(summaries);
  const dayWord = days.length === 1 ? 'day' : 'days';
  const mapPoints = openDay && !openDay.restDay ? mapMarkersFor(editor.draft.points, editor.selectedPointId) : [];
  const plotted = openDay && !openDay.restDay
    ? (editor.freshPreview ? decodePolyline(editor.draft.preview!.encodedPolyline) : editor.definition?.waypoints ?? [])
    : [];

  const summaryLine = `Itinerary · ${days.length} ${dayWord}${totalMiles !== null ? ` · ${totalMiles} mi` : ''}${dirty ? ' · unsaved' : ''}`;

  return (
    <section className="ksu-day ksu-tool">
      <Toolbar
        lead={<ToolbarAction onClick={() => { if (!dirty || window.confirm('Leave without saving? Your unsaved day plan will be lost.')) navigate('/app/trips'); }} side="lead">All trips</ToolbarAction>}
        meta={<>
          {new Date(trip.departureAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} – {new Date(trip.expectedEndAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          {' · '}{days.length} {dayWord}
          {totalMiles !== null ? ` · ${totalMiles} planned mi` : ''}
          {dirty ? ' · unsaved changes' : ''}
          {dailyRemaining !== null && dailyRemaining < 10 ? ` · ${dailyRemaining} road previews left today` : ''}
        </>}
        title={meta?.title ?? 'Trip'}
        trail={<ToolbarAction disabled={!editable || savingTrip || !dirty} onClick={() => void saveTrip()} side="trail">{savingTrip ? 'Saving…' : 'Save the plan'}</ToolbarAction>}
      />
      <div className="ksu-tool-body">
        <div className="ksu-tool-notices">
          {!projectionEditable ? <Notice>Access check is {snapshot.projectionState === 'stale' ? 'stale' : 'unavailable'}. You can read this trip; new edits and route previews are paused until KSU reconnects.</Notice> : null}
          {!isCoordinator ? <Notice>Only the rider who created this trip can change it. You’re viewing the plan.</Notice> : null}
          {!statusEditable || terminalLock ? <Notice>This trip has already started or been closed, so the plan is locked. Riders can still see it.</Notice> : null}
          {pageError ? <Notice tone="error">{pageError}</Notice> : null}
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {departuresOutOfOrder ? <Notice>Departure times are out of order — the plan saves in time order, so the day list will renumber.</Notice> : null}
          {issues.length ? <Notice tone="error"><b>Fix these before saving:</b><ul>{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></Notice> : null}
        </div>

        {editable ? (
          <details className="ksu-disclosure">
            <summary>Change the trip dates</summary>
            <div className="ksu-disclosure-body">
              <div className="ksu-field-grid">
                <TextInput label="Rolling out" onChange={(event) => setStartLocal(event.target.value)} type="datetime-local" value={startLocal} />
                <TextInput label="Back home by" onChange={(event) => setEndLocal(event.target.value)} type="datetime-local" value={endLocal} />
              </div>
              <small className="ksu-field-hint">Dates save with the plan. Days are validated against them.</small>
            </div>
          </details>
        ) : null}

        <div className="ksu-split">
          <aside className="ksu-split-panel">
          {editable && hasAccountCapability(snapshot, 'ai.route_assist') ? (
            <AutopilotPanel
              hasExistingDays={days.length > 0}
              onAccept={(drafts) => acceptAutopilotDays(drafts)}
              onDailyRemaining={(remaining) => setDailyRemaining(remaining)}
              onLodgingCta={autopilotLodgingCta}
              onPreviewUsed={() => setPreviewsUsed((current) => current + 1)}
              previewBudget={SESSION_PREVIEW_BUDGET}
              previewsUsed={previewsUsed}
              staging={meta?.staging ? { displayName: meta.stagingName ?? `${meta.staging.latitude.toFixed(5)}, ${meta.staging.longitude.toFixed(5)}`, latitude: meta.staging.latitude, longitude: meta.staging.longitude } : null}
              tripDepartureAt={currentStart || trip.departureAt}
              tripExpectedEndAt={currentEnd || trip.expectedEndAt}
            />
          ) : null}
          <RibbonRule label={days.length ? `${days.length} ${dayWord}` : 'Day plan'} />
          <ol className="ksu-day-list">
            {days.map((day, index) => {
              const summary = summaries[index];
              const isOpen = day.id === openDayId;
              const heading = tripDayHeading(summary);
              const route = day.restDay ? 'Rest day' : tripLegRouteLabel(summary);
              const distance = tripLegDistanceLabel(summary);
              const overnight = tripLegOvernightLabel(summary);
              const planned = day.restDay || Boolean(route);
              return (
                <li className={`ksu-day-card ${isOpen ? 'open' : ''}`} key={day.id}>
                  <div className="ksu-day-card-head">
                    <button aria-expanded={isOpen} className="ksu-day-trigger" onClick={() => isOpen ? closeDayEditor() : openDayEditor(day.id)} type="button">
                      <span className="ksu-day-ordinal">{index + 1}</span>
                      <span className="ksu-day-copy">
                        <b>{heading}</b>
                        <span>{route ?? 'No stops yet'}</span>
                        <span className="ksu-day-chips">
                          <StampChip label={planned ? 'Planned' : 'Needs a route'} tone={planned ? 'moss' : 'rust'} />
                          {distance ? <StampChip label={distance} /> : null}
                          {overnight ? <StampChip label={overnight} tone="brass" /> : null}
                        </span>
                      </span>
                      <span aria-hidden="true" className="ksu-summary-caret">▼</span>
                    </button>
                    {editable ? (
                      <div className="ksu-day-actions">
                        <button aria-label={`Move day ${index + 1} earlier`} disabled={index === 0} onClick={() => moveDay(day.id, -1)} type="button">↑</button>
                        <button aria-label={`Move day ${index + 1} later`} disabled={index === days.length - 1} onClick={() => moveDay(day.id, 1)} type="button">↓</button>
                        <button aria-label={`Remove day ${index + 1}`} className="danger" onClick={() => removeDay(day.id)} type="button">×</button>
                      </div>
                    ) : null}
                  </div>
                  {isOpen ? (
                    <div className="ksu-day-body">
                      <TextInput disabled={!editable} label="Day title (optional)" maxLength={TRIP_LIMITS.titleMax} onChange={(event) => patchDay(day.id, { title: event.target.value })} value={day.title} />
                      <div className="ksu-field-grid">
                        <TextInput disabled={!editable} label="Departure" onChange={(event) => patchDay(day.id, { departAt: fromLocalInput(event.target.value) })} type="datetime-local" value={day.departAt ? toLocalInput(day.departAt) : ''} />
                        <TextInput disabled={!editable} hint="A soft target. KSU never tracks or enforces it." label="Target arrival (optional)" onChange={(event) => patchDay(day.id, { arriveBy: event.target.value ? fromLocalInput(event.target.value) : '' })} type="datetime-local" value={day.arriveBy ? toLocalInput(day.arriveBy) : ''} />
                      </div>
                      <Toggle checked={day.restDay} disabled={!editable} hint="No riding, no stops." label="Rest day" onChange={(checked) => patchDay(day.id, { restDay: checked })} />
                      {!day.restDay ? (
                        editable ? (
                          <>
                            <RibbonRule label="The road" />
                            {(editor.error ?? editor.hint) ? <Notice tone="error">{editor.error ?? editor.hint}</Notice> : null}
                            <RouteLegEditor editor={editor} />
                            <div className="ksu-row">
                              <Button disabled={!editor.previewReady || editor.busy !== null || (Boolean(editor.draft.preview) && !editor.draft.previewStale)} onClick={() => void runDayPreview()} variant="primary">{editor.busy === 'preview' ? 'Calculating…' : editor.draft.previewStale ? 'Preview updated road' : editor.draft.preview ? 'Road previewed' : 'Preview this day’s road'}</Button>
                              <Button disabled={!editor.freshPreview || editor.busy !== null} onClick={() => void editor.runSave()}>{editor.busy === 'save' ? 'Saving…' : editor.draft.saved ? `Saved revision ${editor.draft.saved.revisionNumber}` : 'Save this day’s route'}</Button>
                            </div>
                            <small className="ksu-field-hint">Saving the route stores the day’s road shape to My routes. It does not save the trip.</small>
                          </>
                        ) : <p className="ksu-field-hint">{tripLegRouteLabel(summary) ?? 'No stops on this day.'}</p>
                      ) : null}
                      <RibbonRule label="Overnight" />
                      <TextInput
                        disabled={!editable}
                        hint={!day.lodgingName.trim() && (day.checkInAt || day.checkOutAt) ? 'Add a name and your check-in times show on riders’ cards.' : undefined}
                        label="Where you’re staying"
                        maxLength={TRIP_LIMITS.lodgingNameMax}
                        onChange={(event) => patchDay(day.id, { lodgingName: event.target.value })}
                        placeholder={lodgingPlaceholder?.dayId === day.id ? lodgingPlaceholder.placeName : undefined}
                        value={day.lodgingName}
                      />
                      <TextInput disabled={!editable} label="Address" maxLength={TRIP_LIMITS.lodgingAddressMax} onChange={(event) => patchDay(day.id, { lodgingAddress: event.target.value })} value={day.lodgingAddress} />
                      <TextInput disabled={!editable} hint="Riders tap this to book their own room. KSU doesn’t book anything and never sees a reservation." label="Booking link" maxLength={TRIP_LIMITS.bookingUrlMax} onChange={(event) => patchDay(day.id, { bookingUrl: event.target.value })} placeholder="https://" value={day.bookingUrl} />
                      <div className="ksu-field-grid">
                        <TextInput disabled={!editable} label="Check-in" onChange={(event) => patchDay(day.id, { checkInAt: event.target.value })} type="datetime-local" value={day.checkInAt} />
                        <TextInput disabled={!editable} label="Check-out" onChange={(event) => patchDay(day.id, { checkOutAt: event.target.value })} type="datetime-local" value={day.checkOutAt} />
                      </div>
                      <TextArea disabled={!editable} label="Notes for the roster" maxLength={TRIP_LIMITS.notesMax} onChange={(event) => patchDay(day.id, { notes: event.target.value })} value={day.notes} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {days.length === 0 ? (
            <div className="ksu-empty">
              <h2>The day-by-day plan isn’t posted yet.</h2>
              <p className="ksu-empty-copy">Riders already see the dates. Add Day 1 to put the first route on their phones.</p>
            </div>
          ) : null}
          {editable ? <Button block disabled={days.length >= TRIP_LIMITS.maxDays} onClick={addDay}>＋ Add a day</Button> : null}
        </aside>
        <div className="ksu-map-frame">
          <GoogleRouteMap
            apiKey={publicEnv.googleMapsBrowserKey}
            mapId={publicEnv.googleMapId}
            onMapClick={editable && openDay && !openDay.restDay ? editor.actions.addMapPoint : () => undefined}
            onPointMoved={editable && openDay && !openDay.restDay ? editor.actions.moveMapPoint : () => undefined}
            onPointSelected={editor.actions.selectPoint}
            points={mapPoints}
            routePoints={plotted}
            selectedPointId={editor.selectedPointId}
            showTraffic={false}
          />
          {editable && openDay && !openDay.restDay ? <RouteMapPalette editor={editor} /> : null}
          {editor.error ? <p className="ksu-map-strip">{editor.error}</p> : null}
        </div>
        </div>

        {/* The collapsible itinerary bar from the phone: one cream strip that
            says what the plan currently is, and opens the day roll-up. */}
        <SummaryBar controlsId="trip-itinerary" onToggle={() => setSummaryOpen((open) => !open)} open={summaryOpen} summary={summaryLine}>
          <ol className="ksu-summary-list">
            {summaries.map((leg, index) => (
              <li key={leg.id}>
                <b>{tripDayHeading(leg)}</b>
                <span>{days[index]?.restDay ? 'Rest day' : tripLegRouteLabel(leg) ?? 'No stops yet'}</span>
                {tripLegDistanceLabel(leg) ? <StampChip label={tripLegDistanceLabel(leg)!} /> : null}
              </li>
            ))}
            {summaries.length === 0 ? <li><span>No days yet.</span></li> : null}
          </ol>
        </SummaryBar>
      </div>
      {editor.busy === 'place' ? <div className="ksu-busy" aria-live="polite">Resolving place…</div> : null}
    </section>
  );
}
