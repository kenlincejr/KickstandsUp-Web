import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';
import { RiderSetupRequired } from './rider-setup-required';
import { fetchRiderAccountState, type RiderAccountState } from './rider-account';

export function ProtectedRoute() {
  const { loading, user } = useAuth();
  const location = useLocation();
  const [account, setAccount] = useState<RiderAccountState | null>(null);

  // Rider-account check: signed in is not the same as "is a KSU rider". Accounts
  // are created in the app (owner policy 2026-07-27), so /app is gated on the
  // profile the app's onboarding writes, not merely on a session.
  useEffect(() => {
    if (!user) {
      setAccount(null);
      return;
    }
    let live = true;
    setAccount(null);
    void fetchRiderAccountState(user.id).then((state) => { if (live) setAccount(state); });
    return () => { live = false; };
  }, [user]);

  if (loading) return <main className="centered-page">Checking your rider account…</main>;
  if (!user) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/signin?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!account) return <main className="centered-page">Checking your rider account…</main>;
  if (account.status === 'setup-required') return <RiderSetupRequired email={user.email} />;
  // An unreachable check is NOT a missing account. Say so and let them retry
  // rather than telling an existing rider to go make an account they have.
  if (account.status === 'unavailable') {
    return (
      <main className="centered-page auth-page">
        <section className="auth-card">
          <p className="kicker">Hang on</p>
          <h1>KSU couldn’t read your rider account.</h1>
          <p>This is usually a connection blip, not a problem with your account.</p>
          <p className="error" role="alert">{account.message}</p>
          <div className="auth-actions">
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </section>
      </main>
    );
  }
  return <Outlet />;
}
