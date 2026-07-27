import { useState } from 'react';
import { AppleGlyph, GooglePlayGlyph } from '../../design/store-glyphs';
import { ComingSoonNotice } from './coming-soon-notice';

/**
 * The web's whole answer to "I don't have an account": a hard-to-miss panel
 * with real store badges, not a line of text at the bottom of the page.
 * Rider accounts are created in the app (owner policy 2026-07-27) — this
 * panel is what makes that unmissable on both auth screens that need it:
 * SignInPage (not signed in yet) and RiderSetupRequired (signed in, but no
 * rider profile).
 *
 * The badges open ComingSoonNotice rather than linking anywhere: there is no
 * real store URL yet, and a Link to /the-app just landed someone on another
 * page with the same two badges — a dead-end loop, not an answer.
 */
export function GetTheAppPanel({ heading, body }: { heading: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="auth-get-app">
      <p className="kicker">{heading}</p>
      <p>{body}</p>
      <div className="auth-store-row">
        <button className="auth-store-badge" type="button" onClick={() => setOpen(true)} aria-label="Download on the App Store — launching soon">
          <AppleGlyph className="auth-store-badge-glyph" />
          <span className="auth-store-badge-txt"><small>Download on the</small><b>App Store</b></span>
        </button>
        <button className="auth-store-badge" type="button" onClick={() => setOpen(true)} aria-label="Get it on Google Play — launching soon">
          <GooglePlayGlyph className="auth-store-badge-glyph" />
          <span className="auth-store-badge-txt"><small>Get it on</small><b>Google Play</b></span>
        </button>
      </div>
      {open ? <ComingSoonNotice onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
