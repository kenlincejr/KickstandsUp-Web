import { Link } from 'react-router-dom';
import { AppleGlyph, GooglePlayGlyph } from '../../design/store-glyphs';

/**
 * The web's whole answer to "I don't have an account": a hard-to-miss panel
 * with real store badges, not a line of text at the bottom of the page.
 * Rider accounts are created in the app (owner policy 2026-07-27) — this
 * panel is what makes that unmissable on both auth screens that need it:
 * SignInPage (not signed in yet) and RiderSetupRequired (signed in, but no
 * rider profile).
 *
 * The badges link to /the-app rather than opening the launch-note modal
 * directly: that modal lives behind `.ksu-site`'s LaunchNoteContext, which
 * these dark, unscoped auth pages don't provide. Routing through /the-app
 * keeps the "still in testing" messaging in one place instead of a second
 * copy that can drift.
 */
export function GetTheAppPanel({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="auth-get-app">
      <p className="kicker">{heading}</p>
      <p>{body}</p>
      <div className="auth-store-row">
        <Link className="auth-store-badge" to="/the-app">
          <AppleGlyph className="auth-store-badge-glyph" />
          <span className="auth-store-badge-txt"><small>Download on the</small><b>App Store</b></span>
        </Link>
        <Link className="auth-store-badge" to="/the-app">
          <GooglePlayGlyph className="auth-store-badge-glyph" />
          <span className="auth-store-badge-txt"><small>Get it on</small><b>Google Play</b></span>
        </Link>
      </div>
    </div>
  );
}
