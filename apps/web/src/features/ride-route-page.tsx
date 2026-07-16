import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import { getAuthorizedRideRoute, type AuthorizedRideRoute } from './ride-repository';

export function RideRoutePage() {
  const { rideId } = useParams();
  const [route, setRoute] = useState<AuthorizedRideRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handoffs = useMemo(() => buildGoogleMapsHandoffs(route?.waypoints ?? []), [route]);

  useEffect(() => {
    let active = true;
    if (!rideId) return;
    void getAuthorizedRideRoute(rideId).then((value) => {
      if (active) setRoute(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'This ride route is unavailable.');
    });
    return () => { active = false; };
  }, [rideId]);

  if (error) return <section className="tool-page route-state"><h1>Ride route unavailable.</h1><p className="error">{error}</p><Link className="secondary-button" to="/app/rides">Back to My Rides</Link></section>;
  if (!route) return <section className="tool-page route-state"><p>Loading the ride route…</p></section>;
  const miles = Math.round(route.distanceMeters / 1609.344);
  const minutes = Math.round(route.durationSeconds / 60);

  return <section className="tool-page route-detail-page">
    <Link className="back-link" to="/app/rides">← My Rides</Link>
    <header className="tool-header"><div><p className="kicker">PUBLISHED RIDE ROUTE</p><h1>Same revision. Same plan.</h1><p>{miles} miles · {Math.floor(minutes / 60)} hr {minutes % 60} min · Revision {route.revisionNumber}</p></div></header>
    <div className="route-detail-grid">
      <article className="itinerary-card"><span>ITINERARY</span><ol>{route.waypoints.map((point, index) => <li key={`${point.latitude}-${point.longitude}-${index}`}><b>{index + 1}</b><div><strong>{point.displayName}</strong><small>{point.kind}</small></div></li>)}</ol></article>
      <aside className="route-action-card"><span>RIDE IT</span><h2>Open the published route.</h2><p>KSU keeps the ride revision fixed. Google Maps handles turn-by-turn navigation without another paid KSU route calculation.</p><div className="handoff-list">{handoffs.map((handoff) => <a className="primary-button" href={handoff.url} key={handoff.segmentNumber} rel="noreferrer" target="_blank">{handoff.segmentCount > 1 ? `Open leg ${handoff.segmentNumber} of ${handoff.segmentCount}` : 'Open in Google Maps'}</a>)}</div></aside>
    </div>
  </section>;
}
