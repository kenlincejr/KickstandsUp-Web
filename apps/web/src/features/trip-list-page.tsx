import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PremiumMark, RibbonRule, ScreenTitle, StampChip, buttonClass } from '../design/day-kit';
import { useAuth } from './auth/auth-context';
import { listMyTrips, type TripListRow } from './trip-repository';

function rangeLabel(trip: TripListRow) {
  const format = (value: string | null) => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const start = format(trip.departureAt);
  const end = format(trip.expectedEndAt);
  return start && end ? `${start} – ${end}` : start ?? 'Dates in KSU';
}

export function TripListPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [trips, setTrips] = useState<TripListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listMyTrips().then((items) => {
      if (active) setTrips(items);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'KSU could not load your trips.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <section className="tool-page ksu-day ksu-page">
      <header className="ksu-page-head">
        {/* PremiumMark rule 1: the mark sits on the ENTRY POINT to the premium
            capability — this page — and nowhere else on it. */}
        <ScreenTitle eyebrow={<>KSU Trips <PremiumMark /></>} title="The multi-day rides you lead.">
          Plan every day on the big screen. Riders see the whole thing on their phones — no app update needed.
        </ScreenTitle>
        <div className="ksu-page-head-actions">
          <Link className={buttonClass('primary')} to="/app/trips/new">Plan a trip</Link>
        </div>
      </header>

      {error ? (
        <div className="ksu-empty">
          <p className="ksu-empty-copy">{error}</p>
          <button className={buttonClass('secondary')} onClick={() => setRefreshKey((value) => value + 1)} type="button">Try again</button>
        </div>
      ) : null}
      {loading ? <div className="ksu-empty"><p className="ksu-empty-copy">Loading your trips…</p></div> : null}
      {!loading && !error && trips.length === 0 ? (
        <div className="ksu-empty">
          <h2>No trips on this account yet.</h2>
          <p className="ksu-empty-copy">A trip is one ride that spans days — dates and staging first, then a day-by-day plan riders follow on their phones.</p>
          <Link className={buttonClass('primary')} to="/app/trips/new">Plan your first trip</Link>
        </div>
      ) : null}

      {!loading && trips.length ? (
        <>
          <RibbonRule label={`${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`} />
          <div className="ksu-card-grid">
            {trips.map((trip) => {
              const riding = Boolean(trip.createdBy && userId && trip.createdBy !== userId);
              return (
                <article className="ksu-trip-card" key={trip.id}>
                  <div className="ksu-trip-card-chips">
                    <StampChip label={trip.status} tone={trip.status === 'scheduled' ? 'moss' : 'brass'} />
                    {riding ? <StampChip label="Riding, not leading" /> : null}
                  </div>
                  <h2 className="ksu-trip-card-title">{trip.title}</h2>
                  <dl className="ksu-trip-card-facts">
                    <div><dt>When</dt><dd>{rangeLabel(trip)}</dd></div>
                    {trip.stagingDisplayName ? <div><dt>Staging</dt><dd>{trip.stagingDisplayName}</dd></div> : null}
                  </dl>
                  <Link className={buttonClass('primary')} to={`/app/trips/${trip.id}`}>Open the day plan</Link>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
