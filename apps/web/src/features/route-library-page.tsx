import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRouteLibrary, setRouteFavorite, type RouteLibraryFilter, type RouteLibraryItem } from './route-library-repository';

const tabs: { id: RouteLibraryFilter; label: string }[] = [
  { id: 'mine', label: 'My routes' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'shared_with_me', label: 'Shared with me' },
];

function miles(meters: number) {
  return `${Math.round(meters / 1609.344)} mi`;
}

function saddleTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function RouteLibraryPage() {
  const [filter, setFilter] = useState<RouteLibraryFilter>('mine');
  const [routes, setRoutes] = useState<RouteLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listRouteLibrary(filter).then((items) => {
      if (active) setRoutes(items);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'KSU could not load your routes.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [filter, refreshKey]);

  const toggleFavorite = async (route: RouteLibraryItem) => {
    const next = !route.isFavorite;
    setRoutes((current) => current.map((item) => item.routePlanId === route.routePlanId ? { ...item, isFavorite: next } : item));
    try {
      await setRouteFavorite(route.routePlanId, next);
      if (filter === 'favorites' && !next) setRoutes((current) => current.filter((item) => item.routePlanId !== route.routePlanId));
    } catch (reason) {
      setRoutes((current) => current.map((item) => item.routePlanId === route.routePlanId ? { ...item, isFavorite: route.isFavorite } : item));
      setError(reason instanceof Error ? reason.message : 'KSU could not update that favorite.');
    }
  };

  return (
    <section className="tool-page route-library-page">
      <header className="tool-header">
        <div><p className="kicker">YOUR ROADBOOK</p><h1>Routes worth riding again.</h1><p>Saved in KSU. Ready on the big screen or handed off to Google Maps.</p></div>
        <Link className="primary-button" to="/app/planner">Plan a route</Link>
      </header>
      <div className="route-tabs" role="tablist" aria-label="Route library">
        {tabs.map((tab) => <button aria-selected={filter === tab.id} className={filter === tab.id ? 'active' : ''} key={tab.id} onClick={() => setFilter(tab.id)} role="tab" type="button">{tab.label}</button>)}
      </div>
      {error ? <div className="route-state error"><p>{error}</p><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)} type="button">Try again</button></div> : null}
      {loading ? <div className="route-state"><p>Checking the garage for your routes…</p></div> : null}
      {!loading && !error && routes.length === 0 ? <div className="route-state"><h2>{filter === 'shared_with_me' ? 'Nothing shared yet.' : 'Your roadbook is empty.'}</h2><p>{filter === 'shared_with_me' ? 'Routes shared by accepted riders will show up here.' : 'Build a route once. Bring it back whenever the road calls.'}</p>{filter !== 'shared_with_me' ? <Link className="secondary-button" to="/app/planner">Plan your first route</Link> : null}</div> : null}
      {!loading && routes.length ? <div className="route-library-grid">{routes.map((route) => {
        const detailId = route.grantId ?? route.routePlanId;
        return <article className="library-route-card" key={`${detailId}-${route.routeRevisionId}`}>
          <div className="route-card-heading"><div><span>{route.regionLabel ?? route.sourceKind ?? 'KSU ROUTE'}</span><h2><Link to={`/app/routes/${detailId}`}>{route.title}</Link></h2></div>{filter !== 'shared_with_me' ? <button aria-label={`${route.isFavorite ? 'Remove' : 'Add'} ${route.title} ${route.isFavorite ? 'from' : 'to'} favorites`} className={`favorite-button${route.isFavorite ? ' active' : ''}`} onClick={() => void toggleFavorite(route)} type="button">★</button> : null}</div>
          <div className="route-facts"><span><b>{miles(route.distanceMeters)}</b> distance</span><span><b>{saddleTime(route.durationSeconds)}</b> saddle time</span><span><b>{route.pointCount}</b> points</span></div>
          <p>{route.provenance ?? route.description ?? `Revision ${route.revisionNumber} · Updated ${new Date(route.updatedAt).toLocaleDateString()}`}</p>
          <Link className="secondary-button" to={`/app/routes/${detailId}`}>View route</Link>
        </article>;
      })}</div> : null}
    </section>
  );
}
