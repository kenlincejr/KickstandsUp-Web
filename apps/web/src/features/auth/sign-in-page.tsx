import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth-context';
import { safeReturnTo } from './auth-intent';

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
        <p className="kicker">One rider account</p>
        <h1>Pick up where you left off.</h1>
        <p>Choose the same sign-in you use in the KSU app. Your rides, access, route revisions, and Club permissions come from that same rider account.</p>
        <div className="auth-actions">
          <button className="primary-button" disabled={!configured} type="button" onClick={() => void startSignIn('google')}>
            Continue with Google
          </button>
          <button className="secondary-button" disabled={!configured} type="button" onClick={() => void startSignIn('apple')}>
            Continue with Apple
          </button>
        </div>
        <p className="auth-provider-note">Use the same provider as the app. Google and Apple sign-ins are separate KSU accounts today.</p>
        {!configured ? <p className="notice">Web sign-in is scaffolded but intentionally disabled until the approved Supabase web environment and OAuth redirect are configured.</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
