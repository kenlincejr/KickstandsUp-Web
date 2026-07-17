import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth-context';
import { safeReturnTo } from './auth-intent';

export function SignInPage({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const { configured, signInWithApple, signInWithGoogle, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const isSignUp = mode === 'signup';

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
        <p className="kicker">{isSignUp ? 'New to KSU?' : 'One rider account'}</p>
        <h1>{isSignUp ? 'Start your KSU account.' : 'Sign in or create your account.'}</h1>
        <p>{isSignUp
          ? 'Choose Google or Apple to create your rider account. After the secure sign-in, you’ll set your rider name, icon, riding preferences, and garage.'
          : 'Use Google or Apple to get into KSU. If this is your first time, that secure sign-in creates your rider account—then you’ll set up your rider profile and garage.'}</p>
        <div className="auth-actions">
          <button className="primary-button" disabled={!configured} type="button" onClick={() => void startSignIn('google')}>
            Continue with Google
          </button>
          <button className="secondary-button" disabled={!configured} type="button" onClick={() => void startSignIn('apple')}>
            Continue with Apple
          </button>
        </div>
        <p className="auth-provider-note">Use the same provider as the app. Google and Apple sign-ins are separate KSU accounts today.</p>
        {isSignUp
          ? <p className="auth-provider-note">Already have an account? <Link to="/signin">Sign in instead.</Link></p>
          : <p className="auth-provider-note">New here? <Link to="/signup">Create your KSU account.</Link></p>}
        {!configured ? <p className="notice">Web sign-in is scaffolded but intentionally disabled until the approved Supabase web environment and OAuth redirect are configured.</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
