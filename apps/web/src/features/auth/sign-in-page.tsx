import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth-context';
import { safeReturnTo } from './auth-intent';

export function SignInPage() {
  const { configured, signInWithGoogle, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  if (user) return <Navigate to={returnTo} replace />;

  const startGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle(returnTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in could not start.');
    }
  };

  return (
    <main className="centered-page auth-page">
      <a className="eyebrow" href="/">KICKSTANDS UP</a>
      <section className="auth-card">
        <p className="kicker">One rider account</p>
        <h1>Pick up where you left off.</h1>
        <p>Your rides, route revisions, and club work stay connected to the same KSU account you use in the app.</p>
        <button className="primary-button" disabled={!configured} type="button" onClick={() => void startGoogleSignIn()}>
          Continue with Google
        </button>
        {!configured ? <p className="notice">Web sign-in is scaffolded but intentionally disabled until the approved Supabase web environment and OAuth redirect are configured.</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
