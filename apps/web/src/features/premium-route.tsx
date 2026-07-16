import { canUsePremiumPlanner } from '@ksu/contracts';
import { Link, Outlet } from 'react-router-dom';
import { useCapabilities } from './capability-context';

export function PremiumRoute() {
  const { loading, snapshot } = useCapabilities();

  if (loading) return <section className="tool-page">Checking your route-planning access…</section>;
  if (canUsePremiumPlanner(snapshot)) return <Outlet />;

  const unavailable = snapshot.projectionState === 'unavailable';
  const stale = snapshot.projectionState === 'stale';

  return (
    <section className="tool-page locked-feature">
      <p className="kicker">PREMIUM ROUTE LAB</p>
      <h1>{unavailable ? "We can't verify planner access." : stale ? 'Planner access needs a fresh check.' : 'Build it on the big screen. Ride it from the app.'}</h1>
      <p>{unavailable ? 'KSU could not load your server access. New planning stays paused; this does not delete any saved or published route.' : stale ? 'Your last access check is stale, so new edits and provider calls stay paused until KSU reconnects.' : 'This account has Participant access, which includes authorized ride routes and map handoff but not personal route authoring.'}</p>
      <Link className="secondary-button" to="/app/account">Check account access</Link>
    </section>
  );
}
