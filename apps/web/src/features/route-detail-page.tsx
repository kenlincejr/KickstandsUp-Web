import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildGoogleMapsHandoffs } from './google-maps-handoff';
import { getRouteLibraryDetail, setRouteFavorite, type RouteLibraryItem } from './route-library-repository';
import { listRouteShareRecipients, shareRouteWithFriends, type RouteShareRecipient } from './route-share-repository';

function routeDistance(meters: number) {
  return `${Math.round(meters / 1609.344)} miles`;
}

function routeDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

export function RouteDetailPage() {
  const { routeId } = useParams();
  const [route, setRoute] = useState<RouteLibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false); const [recipients, setRecipients] = useState<RouteShareRecipient[]>([]); const [selected, setSelected] = useState<string[]>([]); const [allowCopy, setAllowCopy] = useState(false);
  const handoffs = useMemo(() => buildGoogleMapsHandoffs(route?.waypoints ?? []), [route]);

  useEffect(() => {
    let active = true;
    if (!routeId) return;
    setRoute(null);
    setError(null);
    void getRouteLibraryDetail(routeId).then((value) => {
      if (active) setRoute(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'This route is unavailable.');
    });
    return () => { active = false; };
  }, [routeId]);

  const toggleFavorite = async () => {
    if (!route || route.grantId) return;
    const next = !route.isFavorite;
    setRoute({ ...route, isFavorite: next });
    try {
      await setRouteFavorite(route.routePlanId, next);
    } catch (reason) {
      setRoute({ ...route, isFavorite: route.isFavorite });
      setError(reason instanceof Error ? reason.message : 'KSU could not update that favorite.');
    }
  };
  const openShare = async () => { try { setRecipients(await listRouteShareRecipients()); setSharing(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'KSU could not open private sharing.'); } };
  const confirmShare = async () => { if (!route || !selected.length) { setError('Choose at least one accepted friend.'); return; } try { await shareRouteWithFriends(route.routeRevisionId, selected, allowCopy); setSharing(false); setSelected([]); } catch (reason) { setError(reason instanceof Error ? reason.message : 'KSU could not share this route.'); } };

  if (error && !route) return <section className="tool-page route-state"><h1>Route unavailable.</h1><p className="error">{error}</p><Link className="secondary-button" to="/app/routes">Back to My Routes</Link></section>;
  if (!route) return <section className="tool-page route-state"><p>Loading the route…</p></section>;

  return (
    <section className="tool-page route-detail-page">
      <Link className="back-link" to="/app/routes">← My Routes</Link>
      <header className="tool-header">
        <div><p className="kicker">{route.regionLabel ?? 'KSU ROUTE'}</p><h1>{route.title}</h1><p>{routeDistance(route.distanceMeters)} · {routeDuration(route.durationSeconds)} · Revision {route.revisionNumber}</p></div>
        {!route.grantId ? <div className="inline-actions"><button className="secondary-button" onClick={() => void toggleFavorite()} type="button">{route.isFavorite ? '★ Favorited' : '☆ Add favorite'}</button><button className="secondary-button" onClick={() => void openShare()} type="button">Share with friends</button></div> : null}
      </header>
      {error ? <p className="notice error">{error}</p> : null}
      {sharing ? <section className="route-action-card"><span>PRIVATE SHARE</span><h2>Choose accepted friends.</h2><p>Only the friends you select receive this KSU route. You can revoke a share later; nothing becomes public.</p>{recipients.length ? recipients.map((friend) => <label key={friend.id}><input checked={selected.includes(friend.id)} onChange={() => setSelected((current) => current.includes(friend.id) ? current.filter((id) => id !== friend.id) : [...current, friend.id])} type="checkbox" /> {friend.displayName}</label>) : <p className="notice">No accepted friends are available to receive a private route.</p>}<label><input checked={allowCopy} onChange={(event) => setAllowCopy(event.target.checked)} type="checkbox" /> Let recipients save a private copy</label><div className="inline-actions"><button className="secondary-button" onClick={() => setSharing(false)} type="button">Cancel</button><button className="primary-button" disabled={!selected.length} onClick={() => void confirmShare()} type="button">Share route</button></div></section> : null}
      <div className="route-detail-grid">
        <article className="itinerary-card"><span>ITINERARY</span><ol>{route.waypoints.map((point, index) => <li key={`${point.latitude}-${point.longitude}-${index}`}><b>{index + 1}</b><div><strong>{point.displayName}</strong><small>{point.kind.replace('_', ' ')}</small></div></li>)}</ol></article>
        <aside className="route-action-card"><span>RIDE IT</span><h2>Send this route to Google Maps.</h2><p>This handoff does not create another paid KSU route calculation. Longer routes are split into portable legs; continue at each boundary stop.</p>{handoffs.length ? <div className="handoff-list">{handoffs.map((handoff) => <div key={handoff.segmentNumber}><a className="primary-button" href={handoff.url} rel="noreferrer" target="_blank">{handoff.segmentCount > 1 ? `Open leg ${handoff.segmentNumber} of ${handoff.segmentCount}` : 'Open the full route in Google Maps'}</a><small>{handoff.segmentCount > 1 && handoff.nextLegLabel ? `Next leg: ${handoff.nextLegLabel}. ` : ''}{handoff.fidelityWarning ?? handoff.browserWaypointWarning}</small></div>)}</div> : <p className="notice">This route needs at least a start and finish before Maps handoff is available.</p>}{route.provenance ? <p className="route-provenance">{route.provenance}</p> : null}</aside>
      </div>
    </section>
  );
}
