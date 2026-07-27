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

  // §9.3 asymmetry: EDITING pauses on a stale/unavailable projection, READING
  // never does. The pages render read-only with a named banner; unmounting
  // them here would both block free reads and destroy unsaved work when the
  // projection flips stale on its timer mid-edit.
  if (snapshot.projectionState !== 'ready') return <Outlet />;

  const basic = snapshot.accountTier === 'basic';

  return (
    <section className="tool-page locked-feature">
      <p className="kicker">KSU TRIPS</p>
      <h1>Multi-day trips are a Premium feature.</h1>
      <p>
        {basic
          ? 'Your plan includes route planning. Multi-day trips — day-by-day routes, lodging and the whole-trip view — are part of Premium.'
          : 'Multi-day trips — day-by-day routes, lodging and the whole-trip view — are part of KSU Premium.'}
      </p>
      <Link className="secondary-button" to="/app/account">Check account access</Link>
    </section>
  );
}
