// Shared builder for the two token-handoff fallback pages (/connect/:token and
// /invite/:token).
//
// These pages exist for one job: get a rider who tapped a KSU link into the KSU
// app. Until 2026-08-25 they did not do that job at all — they were static prose
// with no button, and the token was never even read (the handler took no params).
// The design assumed Android App Links / iOS Universal Links would always fire,
// so the page was only ever the "app isn't installed" fallback. Two things break
// that assumption:
//
//   1. Facebook Messenger, Instagram, and several SMS clients open links in their
//      own WebView, which honors NEITHER App Links nor Universal Links. The page
//      is what the recipient gets even with the app installed and verification
//      working. That is the case the owner actually hit.
//   2. Android App Link verification also fails outright whenever
//      /.well-known/assetlinks.json carries the wrong signing fingerprint.
//
// So the page needs its own way into the app, and it must work with NO JavaScript:
// these Functions send `default-src 'none'` with no `script-src`, so any inline
// script is blocked by the response's own CSP. Everything here is plain anchors.
//
// Android uses an `intent://` URL — the platform's own documented escape hatch,
// and the one thing well-behaved WebViews forward to the OS. Its
// `browser_fallback_url` points back here with `?noapp=1` rather than at the Play
// Store, because KSU has no public listing yet (closed testing behind an email
// allowlist); a store link would dead-end. iOS gets the `ksu://` custom scheme,
// which is what survives a WebView — a universal-link retry does not.

const APP_PACKAGE = 'com.kickstandsup.ksu';
const APP_SCHEME = 'ksu';
const SITE_ORIGIN = 'https://rideksu.com';

// Same contract the app's own parser enforces (src/features/friends/rider-link.ts):
// 256-bit base64url for newly issued links, plus legacy UUIDs so links shared
// before the token-storage migration stay redeemable. Anything else is treated as
// a malformed link and never reaches an href or the DOM.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LEGACY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidHandoffToken(value) {
  if (typeof value !== 'string') return false;
  return TOKEN_PATTERN.test(value) || LEGACY_UUID_PATTERN.test(value);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// iPadOS 13+ reports a desktop Safari UA, so the iPad check is deliberately a
// separate touch-point probe rather than a substring match on "iPad".
export function detectPlatform(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && /mobile|touch/i.test(ua)) return 'ios';
  return 'other';
}

export function buildAppLink({ route, token, platform }) {
  if (!isValidHandoffToken(token)) return null;
  const path = `/${route}/${token}`;
  if (platform === 'android') {
    const fallback = encodeURIComponent(`${SITE_ORIGIN}${path}?noapp=1`);
    return `intent://rideksu.com${path}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }
  if (platform === 'ios') return `${APP_SCHEME}:/${path}`;
  return null;
}

const styles = `
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F1ECD9; color: #262E1E; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(560px, calc(100% - 40px)); padding: 56px 0; }
      .eyebrow { color: #8C6A22; font-weight: 800; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; }
      h1 { font-size: clamp(2.1rem, 7.5vw, 3.4rem); letter-spacing: -.03em; line-height: 1.02; margin: 16px 0 20px; }
      p { color: #5B6350; font-size: 1.05rem; line-height: 1.65; margin: 0 0 20px; }
      .card { margin-top: 28px; padding: 24px; background: #FBF8EF; border: 1px solid #D2C6A0; border-radius: 16px; }
      .card p { margin: 0; font-size: .95rem; }
      .card p + p { margin-top: 10px; }
      .card h2 { margin: 0 0 10px; font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: #8C6A22; }
      .open { display: flex; align-items: center; justify-content: center; min-height: 52px; padding: 14px 20px; background: #9C4315; color: #FBF8EF; font-size: 1.05rem; font-weight: 700; text-decoration: none; border-radius: 12px; }
      .hint { margin-top: 14px; color: #5B6350; font-size: .9rem; line-height: 1.55; }
      .assurance { margin-top: 28px; padding-top: 20px; border-top: 1px solid #D2C6A0; color: #5B6350; font-size: .9rem; line-height: 1.55; }
      .assurance p { margin: 0; color: inherit; font-size: inherit; line-height: inherit; }
      .assurance p + p { margin-top: 10px; }`;

// `noapp` is set by the Android intent fallback: the OS tried to hand the link to
// KSU, found nothing installed, and sent the rider back here. That rider does not
// need the button again — they need to know how to get the app.
function openSection({ appLink, platform, noApp }) {
  if (noApp) {
    return `      <div class="card">
        <h2>KSU isn&rsquo;t installed</h2>
        <p>KSU is in limited testing and isn&rsquo;t on the App Store or Google Play yet.</p>
        <p>Ask the rider who sent you this link to get you added as a tester &mdash; then open this link again.</p>
      </div>`;
  }

  if (!appLink) {
    // Either the token is malformed, or we're on a desktop browser where no app
    // link can succeed. Saying "open it on your phone" is the only honest answer.
    const body = platform === 'other'
      ? 'Open this link on the phone where KSU is installed.'
      : 'This link looks incomplete. Ask the rider to send it again.';
    return `      <div class="card">
        <p>${body}</p>
      </div>`;
  }

  const target = platform === 'android' ? 'Open in browser' : 'Open in Safari';

  return `      <div class="card">
        <a class="open" href="${escapeHtml(appLink)}">Open in KSU</a>
        <p class="hint">Opened this from Messenger or another app&rsquo;s browser? If the button does nothing, tap the &hellip; menu and choose &ldquo;${target}&rdquo;, then try again.</p>
      </div>`;
}

export function renderHandoffPage({ route, token, userAgent, noApp, title, eyebrow, heading, body, assurance }) {
  const platform = detectPlatform(userAgent);
  const appLink = buildAppLink({ route, token, platform });

  // One closing block, not two. The install answer only belongs here when the
  // page actually offered a button — the no-app and desktop cards already lead
  // with it, and repeating it under its own rule read as two near-identical
  // grey footers.
  const install = appLink && !noApp
    ? '<p>Don&rsquo;t have KSU? It&rsquo;s in limited testing right now &mdash; ask the rider who sent you this link for an invite.</p>'
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <style>${styles}
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${heading}</h1>
      <p>${body}</p>
${openSection({ appLink, platform, noApp })}
      <div class="assurance">${install}<p>${assurance}</p></div>
    </main>
  </body>
</html>`;
}

export const handoffHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
  'Content-Type': 'text/html; charset=UTF-8',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};
