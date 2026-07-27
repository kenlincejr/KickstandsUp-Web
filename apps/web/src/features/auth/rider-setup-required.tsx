import { Link } from 'react-router-dom';
import { useAuth } from './auth-context';

/**
 * Shown when someone signs in on the website but has never completed rider
 * setup in the app. This is the web's whole answer to "create an account": it
 * doesn't offer one, it explains where accounts are made and that the login
 * they just used is the one that will work.
 *
 * Deliberately NOT a redirect to /signin — that would loop, because they ARE
 * signed in. It's a terminal screen with two ways out: get the app, or sign out.
 */
export function RiderSetupRequired({ email }: { email?: string | null }) {
  const { signOut } = useAuth();

  return (
    <main className="centered-page auth-page">
      <a className="eyebrow" href="/">KICKSTANDS UP</a>
      <section className="auth-card">
        <p className="kicker">Almost there</p>
        <h1>Finish setting up in the app.</h1>
        <p>
          Rider accounts are created in the KSU app, not on the web. Download KSU, sign in with
          {email ? <> the same login (<b>{email}</b>)</> : ' the same login you just used'}, and set up
          your rider profile and garage. Once that’s done, everything here works — same account, same
          rides, bigger screen.
        </p>
        <div className="auth-actions">
          <Link className="primary-button" to="/the-app">Get the KSU app</Link>
          <button className="secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
        <p className="auth-provider-note">
          Already set up in the app? Sign out and back in — the website reads your rider profile on sign-in.
        </p>
      </section>
    </main>
  );
}
