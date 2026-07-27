// The Plan step's default path — trip-autopilot-spec-2026-07-26 §6.3:
//
//   ◆ Plan my days for me          ← PRIMARY. Runs Autopilot immediately.
//     Tune it first  ▾              ← collapsed dials (§4.4)
//     I'll build the days myself    ← manual day builder = the day list below (D-K)
//
// Ordering is load-bearing. "I'll build the days myself" is never removed —
// dismissing this panel just collapses it back to a small re-open link; the
// day list and "+ Add a day" always stay reachable underneath (D-K: this is
// NOT a second day-editing UI, it only ever hands TripDayDraft[] to the
// existing editor via onAccept).
//
// Cost model (§4.3): exactly ONE `previewRoute` call per destination/avoid-
// flag combination, cached in memory for the whole session. Every dial
// change below re-solves synchronously from that cached profile — free,
// offline, no network — via a plain useMemo, not a button.
//
// Gating: the page (trip-editor-page.tsx via TripAuthoringRoute) already
// requires `routes.plan.web` (Premium). This panel ADDITIONALLY requires
// `ai.route_assist` (spec §8.1/§8.2) and renders nothing without it — see
// the capability check in the caller. The `ksu_route_assist` server meter
// (`begin_route_assist`) exists in the schema (seeded disabled) but has NO
// edge-function dispatcher yet, so this panel does not call it: the solve
// itself is free/offline (§4.1), and there is nothing to meter until that
// dispatcher ships. Flagged as follow-up, not silently skipped.
import { useMemo, useRef, useState } from 'react';
import { searchPlaces, resolvePlace, previewRoute, decodePolyline, type PlaceSuggestion } from '../route-planner-repository';
import { autopilotDaysToDrafts } from './autopilot-plan';
import {
  buildRouteProfile,
  deriveCandidateSamples,
  solveAutopilot,
  type AnchorCandidate,
  type AutopilotRequest,
  type AutopilotResult,
  type DayShape,
  type ResolvedAnchorName,
  type RouteProfile,
} from './trip-autopilot';
import { findLodgingCta } from './trip-autopilot-reasons';
import type { TripDayDraft } from '../trip-payload';

export type AutopilotStaging = { displayName: string; latitude: number; longitude: number };

export type AutopilotPanelProps = {
  tripDepartureAt: string;
  tripExpectedEndAt: string;
  staging: AutopilotStaging | null;
  hasExistingDays: boolean;
  previewsUsed: number;
  previewBudget: number;
  onPreviewUsed: () => void;
  onAccept: (drafts: TripDayDraft[]) => void;
  /** Tapping "Find lodging near X" on a not-yet-accepted proposal day accepts
   *  the whole plan (same explicit-confirm rule as "Use these days") and asks
   *  the caller to focus that day's own lodging fields — Autopilot itself
   *  never writes one (§3.2c). `drafts` is the SAME conversion "Use these
   *  days" would produce, handed over so the caller doesn't need to re-derive
   *  it from `dayIndex` alone. */
  onLodgingCta: (dayIndex: number, placeName: string, drafts: TripDayDraft[]) => void;
};

const saddleHourOptions = [4, 5, 6, 7, 8];

type Dials = {
  saddleHours: number;
  saddleHard: boolean;
  dayShape: DayShape;
  inBeforeDarkOn: boolean;
  inBeforeDarkHard: boolean;
  dayCountMode: 'auto' | number;
  dayCountHard: boolean;
  returnByEnabled: boolean;
  returnByHard: boolean;
};

const defaultDials: Dials = {
  saddleHours: 6,
  saddleHard: false,
  dayShape: 'even',
  inBeforeDarkOn: true,
  inBeforeDarkHard: false,
  dayCountMode: 'auto',
  dayCountHard: false,
  returnByEnabled: true,
  returnByHard: false,
};

type HardDial = 'saddle' | 'dark' | 'dayCount' | 'returnBy';

function activeHardDials(dials: Dials): HardDial[] {
  const active: HardDial[] = [];
  if (dials.saddleHard) active.push('saddle');
  if (dials.inBeforeDarkOn && dials.inBeforeDarkHard) active.push('dark');
  if (dials.dayCountMode !== 'auto' && dials.dayCountHard) active.push('dayCount');
  if (dials.returnByEnabled && dials.returnByHard) active.push('returnBy');
  return active;
}

function dialLabel(dial: HardDial): string {
  switch (dial) {
    case 'saddle': return 'saddle budget';
    case 'dark': return 'in before dark';
    case 'dayCount': return 'day count';
    case 'returnBy': return 'return date';
  }
}

/** Fingerprint the inputs that actually change the profile — a dial change never touches this (§4.3). */
function routeFingerprint(destination: { placeId?: string; latitude: number; longitude: number } | null, avoidHighways: boolean, avoidTolls: boolean, avoidFerries: boolean): string | null {
  if (!destination) return null;
  return `${destination.placeId ?? `${destination.latitude},${destination.longitude}`}|${avoidHighways}|${avoidTolls}|${avoidFerries}`;
}

export function AutopilotPanel({ tripDepartureAt, tripExpectedEndAt, staging, hasExistingDays, previewsUsed, previewBudget, onPreviewUsed, onAccept, onLodgingCta }: AutopilotPanelProps) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(hasExistingDays);
  const [tuneOpen, setTuneOpen] = useState(false);

  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destination, setDestination] = useState<{ displayName: string; placeId?: string; latitude: number; longitude: number } | null>(null);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);
  const placeSession = useRef(crypto.randomUUID());

  const [profile, setProfile] = useState<RouteProfile | null>(null);
  const [candidates, setCandidates] = useState<AnchorCandidate[] | null>(null);
  const [profileFingerprint, setProfileFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'previewing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [dials, setDials] = useState<Dials>(defaultDials);
  const [demoteNotice, setDemoteNotice] = useState<string | null>(null);

  const currentFingerprint = routeFingerprint(destination, avoidHighways, avoidTolls, avoidFerries);
  const profileStale = profile !== null && currentFingerprint !== profileFingerprint;

  const searchDestination = (value: string) => {
    setDestination(null);
    setDestinationQuery(value);
    if (value.trim().length < 3) { setDestinationSuggestions([]); return; }
    void searchPlaces(value.trim(), placeSession.current).then(setDestinationSuggestions).catch(() => undefined);
  };

  const chooseDestination = async (suggestion: PlaceSuggestion) => {
    try {
      const place = await resolvePlace(suggestion.placeId, placeSession.current);
      setDestination({ displayName: place.displayName, placeId: place.placeId, latitude: place.latitude, longitude: place.longitude });
      setDestinationQuery(place.displayName);
      setDestinationSuggestions([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not use that destination.');
    }
  };

  const request: AutopilotRequest | null = useMemo(() => {
    if (!profile || !candidates || profileStale) return null;
    const dayCount = dials.dayCountMode === 'auto' ? undefined : { value: dials.dayCountMode, mode: dials.dayCountHard ? ('hard' as const) : ('soft' as const) };
    const returnBy = dials.returnByEnabled ? { value: tripExpectedEndAt, mode: dials.returnByHard ? ('hard' as const) : ('soft' as const) } : undefined;
    return {
      departAt: tripDepartureAt,
      returnBy,
      dayCount,
      profile,
      candidates,
      saddleBudgetSeconds: { value: dials.saddleHours * 3600, mode: dials.saddleHard ? 'hard' : 'soft' },
      dayShape: dials.dayShape,
      inBeforeDark: { value: dials.inBeforeDarkOn, mode: dials.inBeforeDarkHard ? 'hard' : 'soft' },
      restCadenceSeconds: 2 * 3600,
      overnightStandard: 'any',
      weatherPosture: 'suggest',
    };
  }, [profile, candidates, profileStale, dials, tripDepartureAt, tripExpectedEndAt]);

  // Free, synchronous re-solve on every dial or profile change — no network,
  // no button (§4.3: "re-solve after a nudge or a dial change is free").
  const result: AutopilotResult | null = useMemo(() => {
    if (!request) return null;
    try {
      return solveAutopilot(request);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Autopilot could not solve that combination of dials.');
      return null;
    }
  }, [request]);

  const runPreviewAndSolve = async () => {
    if (!staging) { setError('This trip has no staging pin yet — day 1 needs a starting point.'); return; }
    if (!destination) { setError('Search a destination first.'); return; }
    setError(null);
    setCollapsed(false);
    // Already have a fresh profile for this exact destination/avoid-flag
    // combination — solve is already computed by the useMemo above, nothing
    // to fetch (§4.3's cache-in-memory rule).
    if (profile && !profileStale) return;
    if (previewsUsed >= previewBudget) {
      setError(`You've previewed this trip ${previewBudget} times in this session. Each preview is a paid road calculation — save the plan and come back if you need more.`);
      return;
    }
    setBusy('previewing');
    try {
      const preview = await previewRoute({
        title: 'Autopilot preview',
        avoidHighways,
        avoidTolls,
        avoidFerries,
        waypoints: [
          { kind: 'origin', displayName: staging.displayName, latitude: staging.latitude, longitude: staging.longitude, source: 'manual', coordinateProvenance: 'ksu_customer' },
          { kind: 'destination', displayName: destination.displayName, latitude: destination.latitude, longitude: destination.longitude, source: 'google_place', coordinateProvenance: 'google_places', googlePlaceId: destination.placeId },
        ],
      });
      onPreviewUsed();
      // The web preview response carries no per-leg data (spec §6.1) — always
      // the whole-route fallback path, always interpolated:true, with the
      // solver's "about" honesty prefix doing the work on every reason string.
      const path = decodePolyline(preview.encodedPolyline);
      const builtProfile = buildRouteProfile(path, undefined, preview.durationSeconds);
      const resolveName = (pointIndex: number): ResolvedAnchorName => {
        if (pointIndex === 0) return { name: staging.displayName, nameSource: 'place_search', offRouteMeters: 0 };
        if (pointIndex === builtProfile.points.length - 1) return { name: destination.displayName, nameSource: 'place_search', offRouteMeters: 0 };
        // KSU-web has no free naming source wired today (place-search is the
        // PAID Google path — owner decision D-3 forbids calling it per
        // candidate). Every interior candidate resolves unnamed; the solver's
        // "Mile N" fallback renders instead. TODO(follow-up): wire the free
        // Photon discovery-cache Worker (workers/discovery-cache) here once
        // it's reachable from ksu-web, matching the device's §3.2b resolver.
        return { name: null, nameSource: 'none', offRouteMeters: 0 };
      };
      setProfile(builtProfile);
      setCandidates(deriveCandidateSamples(builtProfile, resolveName));
      setProfileFingerprint(currentFingerprint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KSU could not preview that route.');
    } finally {
      setBusy('idle');
    }
  };

  const toggleHard = (dial: HardDial, next: boolean) => {
    if (next) {
      const active = activeHardDials(dials);
      if (!active.includes(dial) && active.length >= 2) {
        setDemoteNotice(`Only two dials can be hard at once. Demote ${active.map(dialLabel).join(' or ')} first, or leave "${dialLabel(dial)}" as a preference.`);
        return;
      }
    }
    setDemoteNotice(null);
    setDials((current) => {
      switch (dial) {
        case 'saddle': return { ...current, saddleHard: next };
        case 'dark': return { ...current, inBeforeDarkHard: next };
        case 'dayCount': return { ...current, dayCountHard: next };
        case 'returnBy': return { ...current, returnByHard: next };
      }
    });
  };

  const demote = (dial: HardDial) => toggleHard(dial, false);

  const useTheseDays = () => {
    if (!result || result.status !== 'solved') return;
    onAccept(autopilotDaysToDrafts(result.plan, { departureAt: tripDepartureAt, expectedEndAt: tripExpectedEndAt }));
    setCollapsed(true);
  };

  const useRelaxedDays = () => {
    if (!result || result.status !== 'infeasible' || !result.conflict.relaxation) return;
    onAccept(autopilotDaysToDrafts(result.conflict.relaxation.preview, { departureAt: tripDepartureAt, expectedEndAt: tripExpectedEndAt }));
    setCollapsed(true);
  };

  if (dismissed) {
    return <button className="secondary-button" onClick={() => setDismissed(false)} type="button">Plan my days for me</button>;
  }

  if (collapsed) {
    return (
      <div className="planner-panel autopilot-panel autopilot-panel-collapsed">
        <button className="secondary-button" onClick={() => setCollapsed(false)} type="button">↻ Re-plan with Autopilot</button>
      </div>
    );
  }

  return (
    <section className="planner-panel autopilot-panel">
      <fieldset className="route-options">
        <legend>Where it ends</legend>
        <label><span>Destination</span><input autoComplete="off" onChange={(event) => searchDestination(event.target.value)} placeholder="Search where the trip ends" value={destinationQuery} /></label>
        {destinationSuggestions.length ? (
          <div className="place-results">
            {destinationSuggestions.map((suggestion) => (
              <button key={suggestion.placeId} onClick={() => void chooseDestination(suggestion)} type="button">
                <b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        <label><input checked={avoidHighways} onChange={(event) => setAvoidHighways(event.target.checked)} type="checkbox" /> Avoid highways</label>
        <label><input checked={avoidTolls} onChange={(event) => setAvoidTolls(event.target.checked)} type="checkbox" /> Avoid tolls</label>
        <label><input checked={avoidFerries} onChange={(event) => setAvoidFerries(event.target.checked)} type="checkbox" /> Avoid ferries</label>
        {profile && !profileStale ? <small>Route previewed · {Math.round(profile.totalMeters / 1609.344)} mi, about {Math.round(profile.totalSeconds / 3600)}h — re-solving on every dial change costs nothing.</small> : null}
      </fieldset>

      {error ? <div className="planner-notice error" role="alert">{error}</div> : null}

      <div className="autopilot-entry">
        <button className="primary-button autopilot-primary" disabled={busy === 'previewing'} onClick={() => void runPreviewAndSolve()} type="button">
          {busy === 'previewing' ? 'Previewing the route…' : 'Plan my days for me'}
        </button>
        <button aria-expanded={tuneOpen} className="link-button" onClick={() => setTuneOpen((current) => !current)} type="button">
          Tune it first {tuneOpen ? '▴' : '▾'}
        </button>
        <button className="link-button" onClick={() => setDismissed(true)} type="button">I’ll build the days myself</button>
      </div>

      {tuneOpen ? (
        <fieldset className="route-options autopilot-dials">
          <legend>Dials</legend>
          <label><span>Daily saddle budget</span>
            <select onChange={(event) => setDials((current) => ({ ...current, saddleHours: Number(event.target.value) }))} value={dials.saddleHours}>
              {saddleHourOptions.map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}
            </select>
          </label>
          <label><input checked={dials.saddleHard} onChange={(event) => toggleHard('saddle', event.target.checked)} type="checkbox" /> Hold this exactly (hard)</label>

          <label><span>Day shape</span>
            <select onChange={(event) => setDials((current) => ({ ...current, dayShape: event.target.value as DayShape }))} value={dials.dayShape}>
              <option value="even">Even</option>
              <option value="front_loaded">Front-loaded</option>
              <option value="back_loaded">Back-loaded</option>
            </select>
          </label>

          <label><input checked={dials.inBeforeDarkOn} onChange={(event) => setDials((current) => ({ ...current, inBeforeDarkOn: event.target.checked }))} type="checkbox" /> In before dark</label>
          {dials.inBeforeDarkOn ? <label><input checked={dials.inBeforeDarkHard} onChange={(event) => toggleHard('dark', event.target.checked)} type="checkbox" /> Never after dark (hard)</label> : null}

          <label><span>Day count</span>
            <select
              onChange={(event) => setDials((current) => ({ ...current, dayCountMode: event.target.value === 'auto' ? 'auto' : Number(event.target.value) }))}
              value={dials.dayCountMode === 'auto' ? 'auto' : String(dials.dayCountMode)}
            >
              <option value="auto">Let Autopilot choose</option>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'day' : 'days'}</option>)}
            </select>
          </label>
          {dials.dayCountMode !== 'auto' ? <label><input checked={dials.dayCountHard} onChange={(event) => toggleHard('dayCount', event.target.checked)} type="checkbox" /> Pin exactly (hard)</label> : null}

          <label><input checked={dials.returnByEnabled} onChange={(event) => setDials((current) => ({ ...current, returnByEnabled: event.target.checked }))} type="checkbox" /> Back by the trip's end date</label>
          {dials.returnByEnabled ? <label><input checked={dials.returnByHard} onChange={(event) => toggleHard('returnBy', event.target.checked)} type="checkbox" /> Must make that date (hard)</label> : null}

          {demoteNotice ? (
            <div className="planner-notice" role="status">
              {demoteNotice}
              <div className="button-row">
                {activeHardDials(dials).map((dial) => <button key={dial} onClick={() => demote(dial)} type="button">Demote {dialLabel(dial)}</button>)}
              </div>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {result?.status === 'solved' ? (
        <div className="autopilot-proposal">
          <div className="button-row">
            <button className="primary-button" onClick={useTheseDays} type="button">Use these days</button>
            <small>{result.plan.legs.length} {result.plan.legs.length === 1 ? 'day' : 'days'} · {Math.round(result.plan.totalMeters / 1609.344)} planned mi</small>
          </div>
          <ol className="autopilot-day-list">
            {result.plan.legs.map((leg, index) => {
              const anchor = leg.stops[0];
              const trades = result.plan.trades.filter((trade) => trade.dayIndex === index);
              return (
                <li key={index}>
                  <b>Day {index + 1}</b>
                  <p>{leg.reason}</p>
                  {trades.map((trade, tradeIndex) => <p className="autopilot-trade" key={tradeIndex}>{trade.message}</p>)}
                  {anchor ? (
                    <button
                      className="link-button"
                      onClick={() => onLodgingCta(index, anchor.displayName, autopilotDaysToDrafts(result.plan, { departureAt: tripDepartureAt, expectedEndAt: tripExpectedEndAt }))}
                      type="button"
                    >
                      {findLodgingCta(anchor.displayName)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {result?.status === 'infeasible' ? (
        <div className="planner-notice error" role="alert">
          <p><b>Those days won't fit.</b> {result.conflict.message}</p>
          {result.conflict.relaxation ? (
            <div className="button-row">
              <button className="secondary-button" onClick={useRelaxedDays} type="button">Use the relaxed plan instead</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
