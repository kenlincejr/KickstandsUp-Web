// Gate for /app/trips*. Trip AUTHORING gates on routes.plan.web (Premium),
// never on routes.plan (Basic) and never on a UI tier label — see
// canAuthorTripsOnWeb. Reading a published trip stays free server-side; this
// gate only fronts the authoring surface.
import { canAuthorTripsOnWeb } from '@ksu/contracts';
import { Link, Outlet } from 'react-router-dom';
import { useCapabilities } from './capability-context';

export function TripAuthoringRoute() {
  const { loading, snapshot } = useCapabilities();

  if (loading) return <section className="tool-page">Checking your trip-planning access…</section>;
  if (canAuthorTripsOnWeb(snapshot)) return <Outlet />;

  const unavailable = snapshot.projectionState === 'unavailable';
  const stale = snapshot.projectionState === 'stale';
  const basic = snapshot.accountTier === 'basic';

  return (
    <section className="tool-page locked-feature">
      <p className="kicker">KSU TRIPS</p>
      <h1>{unavailable ? "We can't verify trip planning access." : stale ? 'Trip planning needs a fresh check.' : 'Multi-day trips are a Premium feature.'}</h1>
      <p>
        {unavailable
          ? "KSU couldn't load your server access. Planning stays paused; nothing you've already saved or published is affected."
          : stale
            ? "Your last access check is stale, so new edits and provider calls stay paused until KSU reconnects. Trips you've already published still show on riders' phones."
            : basic
              ? 'Your plan includes route planning. Multi-day trips — day-by-day routes, lodging and the whole-trip view — are part of Premium.'
              : 'Multi-day trips — day-by-day routes, lodging and the whole-trip view — are part of KSU Premium.'}
      </p>
      <Link className="secondary-button" to="/app/account">Check account access</Link>
    </section>
  );
}
