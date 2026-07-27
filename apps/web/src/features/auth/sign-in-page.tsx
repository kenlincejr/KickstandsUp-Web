import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth-context';
import { safeReturnTo } from './auth-intent';

/**
 * EXISTING RIDERS ONLY. Owner policy 2026-07-27: rider accounts are created in
 * the installed app, never on the website, so this page must not offer, imply,
 * or link to account creation. A first timer gets pointed at the app with the
 * promise that the same login works here afterwards — and if they sign in
 * anyway, ProtectedRoute stops them at RiderSetupRequired instead of letting a
 * profile-less session into /app.
 *
 * The `mode="signup"` variant this page used to carry is gone, and /signup now
 * redirects here (app.tsx) so old links land somewhere honest.
 */
export function SignInPage() {
  const { configured, signInWithApple, signInWithGoogle, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  if (user) return <Navigate to={returnTo} replace />;

  const startSignIn = async (provider: 'google' | 'apple') => {
    setError(null);
    try {
      await (provider === 'google' ? signInWithGoogle(returnTo) : signInWithApple(returnTo));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in could not start.');
    }
  };

  return (
    <main className="centered-page auth-page">
      <a className="eyebrow" href="/">KICKSTANDS UP</a>
      <section className="auth-card">
        <p className="kicker">Already ride with KSU?</p>
        <h1>Sign in.</h1>
        <p>
          Use the same Google or Apple login you use in the KSU app. Your rides, routes, garage and
          club show up here on the bigger screen.
        </p>
        <div className="auth-actions">
          <button className="primary-button" disabled={!configured} type="button" onClick={() => void startSignIn('google')}>
            Continue with Google
          </button>
          <button className="secondary-button" disabled={!configured} type="button" onClick={() => void startSignIn('apple')}>
            Continue with Apple
          </button>
        </div>
        <p className="auth-provider-note">Use the same provider as the app. Google and Apple sign-ins are separate KSU accounts today.</p>
        <p className="auth-provider-note">
          <b>New to KSU?</b> Rider accounts are created in the app. <Link to="/the-app">Download KSU</Link>, set up your
          rider profile there, then sign in here with that same login.
        </p>
        {!configured ? <p className="notice">Web sign-in is scaffolded but intentionally disabled until the approved Supabase web environment and OAuth redirect are configured.</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
