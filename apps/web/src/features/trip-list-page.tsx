import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
    <section className="tool-page route-library-page">
      <header className="tool-header">
        <div><p className="kicker">KSU TRIPS</p><h1>The multi-day rides you lead.</h1><p>Plan every day on the big screen. Riders see the whole thing on their phones — no app update needed.</p></div>
        <div className="route-header-actions"><Link className="primary-button" to="/app/trips/new">Plan a trip</Link></div>
      </header>
      {error ? <div className="route-state error"><p>{error}</p><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)} type="button">Try again</button></div> : null}
      {loading ? <div className="route-state"><p>Loading your trips…</p></div> : null}
      {!loading && !error && trips.length === 0 ? <div className="route-state"><h2>No trips on this account yet.</h2><p>A trip is one ride that spans days — dates and staging first, then a day-by-day plan riders follow on their phones.</p><Link className="primary-button" to="/app/trips/new">Plan your first trip</Link></div> : null}
      {!loading && trips.length ? <div className="route-library-grid rides-grid">{trips.map((trip) => <article className="library-route-card" key={trip.id}>
        <div className="route-card-heading"><div><span>trip · {trip.status}</span><h2>{trip.title}</h2></div></div>
        <div className="ride-when"><strong>{rangeLabel(trip)}</strong>{trip.stagingDisplayName ? <span>Staging: {trip.stagingDisplayName}</span> : null}</div>
        <div className="button-row ride-actions">
          <Link className="primary-button" to={`/app/trips/${trip.id}`}>Open the day plan</Link>
        </div>
      </article>)}</div> : null}
    </section>
  );
}
