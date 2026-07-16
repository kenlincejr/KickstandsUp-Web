import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyRides, stagingMapsUrl, type RiderRide } from './ride-repository';

function departure(ride: RiderRide) {
  if (ride.departureAt && !Number.isNaN(Date.parse(ride.departureAt))) {
    return new Date(ride.departureAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  return ride.departureLabel ?? 'Departure time in KSU';
}

export function RideListPage() {
  const [rides, setRides] = useState<RiderRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listMyRides().then((items) => {
      if (active) setRides(items);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'KSU could not load your rides.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <section className="tool-page route-library-page">
      <header className="tool-header"><div><p className="kicker">YOUR RIDES</p><h1>The rides you can actually open.</h1><p>Owned, joined, and invited rides come from the same KSU account you use on your phone.</p></div></header>
      {error ? <div className="route-state error"><p>{error}</p><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)} type="button">Try again</button></div> : null}
      {loading ? <div className="route-state"><p>Loading your authorized rides…</p></div> : null}
      {!loading && !error && rides.length === 0 ? <div className="route-state"><h2>No rides on this account yet.</h2><p>Create or join a ride in the KSU app, then refresh this page. It will appear here without a second account.</p></div> : null}
      {!loading && rides.length ? <div className="route-library-grid rides-grid">{rides.map((ride) => <article className="library-route-card" key={ride.id}>
        <div className="route-card-heading"><div><span>{ride.rideType.replace('_', ' ')} · {ride.status}</span><h2>{ride.title}</h2></div></div>
        <div className="ride-when"><strong>{departure(ride)}</strong><span>{ride.pace ?? 'Ride pace in KSU'}</span></div>
        <p><b>Meet here:</b> {ride.stagingDisplayName}{ride.stagingAddress ? ` · ${ride.stagingAddress}` : ''}</p>
        <div className="button-row ride-actions">
          <a className="secondary-button" href={stagingMapsUrl(ride)} rel="noreferrer" target="_blank">Navigate to staging</a>
          {ride.routeRevisionId ? <Link className="primary-button" to={`/app/rides/${ride.id}/route`}>Open ride route</Link> : <span className="route-missing">No route attached</span>}
        </div>
      </article>)}</div> : null}
    </section>
  );
}
