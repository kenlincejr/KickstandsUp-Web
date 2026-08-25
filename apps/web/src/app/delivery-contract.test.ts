import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain-JS Pages Function helper, shared with functions/.
import { handoffHeaders, renderHandoffPage } from '../../../../lib/handoff-page.js';

const publicDir = resolve(import.meta.dirname, '../../public');
const repoDir = resolve(import.meta.dirname, '../../../..');

function publicFile(path: string) {
  return readFileSync(resolve(publicDir, path), 'utf8');
}

function repoFile(path: string) {
  return readFileSync(resolve(repoDir, path), 'utf8');
}

describe('Cloudflare delivery contract', () => {
  it('preserves every current privacy-safe fallback before the SPA rewrite', () => {
    const redirects = publicFile('_redirects');

    expect(redirects).toContain('/invite/*  /invite/index.html  200');
    expect(redirects).toContain('/connect/*  /connect/index.html  200');
    expect(redirects).toContain('/privacy    /privacy/index.html  200');
    expect(redirects).toContain('/terms      /terms/index.html  200');
    expect(redirects).toContain('/support    /support/index.html  200');
    expect(redirects).toContain('/delete-account    /delete-account/index.html  200');
    expect(redirects.trimEnd()).toMatch(/\/\*\s+\/index\.html\s+200$/);
  });

  it('keeps token and authentication routes out of shared caches and referrers', () => {
    const headers = publicFile('_headers');

    expect(headers).toMatch(/\/auth\/\*[\s\S]*?Cache-Control: no-store[\s\S]*?Referrer-Policy: no-referrer/);
    for (const route of ['invite', 'connect']) {
      expect(headers).toMatch(new RegExp(`/${route}/\\*[\\s\\S]*?Cache-Control: no-store[\\s\\S]*?Referrer-Policy: no-referrer[\\s\\S]*?X-Robots-Tag: noindex, nofollow`));
    }
  });

  it('keeps sign-in routed and provider-complete even though the landing page omits login', () => {
    // The homepage is intentionally login-free (marketing-only launch page — see
    // docs/decisions.md). /signin still exists and still carries the same
    // Google/Apple providers; only the home page's own links were dropped.
    const signIn = repoFile('apps/web/src/features/auth/sign-in-page.tsx');
    const auth = repoFile('apps/web/src/features/auth/auth-context.tsx');
    const routes = repoFile('apps/web/src/app/app.tsx');

    expect(signIn).toContain('Continue with Google');
    expect(signIn).toContain('Continue with Apple');
    expect(auth).toContain("provider: 'google' | 'apple'");
    expect(routes).toContain('path="/login"');
    expect(routes).toContain('to="/signin"');
    expect(routes).toContain('path="/signup"');
  });

  it('is sign-in only: the web never creates a rider account (owner policy 2026-07-27)', () => {
    const signIn = repoFile('apps/web/src/features/auth/sign-in-page.tsx');
    const routes = repoFile('apps/web/src/app/app.tsx');
    const guard = repoFile('apps/web/src/features/auth/protected-route.tsx');
    const setup = repoFile('apps/web/src/features/auth/rider-setup-required.tsx');
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // /signup must be a redirect, never a signup surface. Asserted on the route
    // line itself so re-pointing it at a page fails here.
    expect(routes).toMatch(/path="\/signup" element=\{<Navigate to="\/signin" replace \/>\}/);
    // The page carries no signup mode and offers no account creation.
    expect(signIn).not.toContain("mode?: 'signin' | 'signup'");
    expect(signIn).not.toContain('to="/signup"');
    const signInCopy = strip(signIn);
    for (const promise of ['create your account', 'Create your KSU account', 'creates your rider account', 'Start your KSU account']) {
      expect(signInCopy, `sign-in must not offer account creation: "${promise}"`).not.toContain(promise);
    }
    // It must say where accounts ARE made, and point at the app.
    expect(signInCopy).toContain('accounts are created in the app');

    // Signed in is not the same as "is a rider": /app is gated on the profile the
    // app's onboarding writes, and the terminal screen sends them to the app.
    expect(guard).toContain('fetchRiderAccountState');
    expect(guard).toContain("account.status === 'setup-required'");
    expect(guard).toContain('RiderSetupRequired');
    // A failed probe must not be treated as a missing account.
    expect(guard).toContain("account.status === 'unavailable'");
    expect(setup).toContain('created in the KSU app');
    expect(setup).not.toContain('to="/signup"');

    // Both screens use the SAME hard-to-miss store-badge panel, not a buried
    // text link — that's the whole point of the 2026-07-27 follow-up ("make
    // the no-account path more obvious, point them at the store links").
    const panel = repoFile('apps/web/src/features/auth/get-the-app-panel.tsx');
    expect(signIn).toContain('<GetTheAppPanel');
    expect(setup).toContain('<GetTheAppPanel');
    expect(panel).toContain('AppleGlyph');
    expect(panel).toContain('GooglePlayGlyph');
    // Real store badges, not the marketing site's — that component depends on
    // .ksu-site's LaunchNoteContext, which these dark auth pages don't provide.
    expect(panel).not.toContain("from '../site/site-chrome'");
    // The badges must NOT link to another page. /the-app has the same two
    // badges, so a Link there is a dead-end loop, not an answer — they open
    // ComingSoonNotice instead (there is no real store URL yet).
    expect(panel).not.toContain('to="/the-app"');
    expect(panel).toContain('ComingSoonNotice');
    const notice = repoFile('apps/web/src/features/auth/coming-soon-notice.tsx');
    expect(notice).toContain('role="dialog"');
    expect(notice).toContain('aria-modal="true"');
    // Same-message-twice by design, not a shared component reaching across
    // the .ksu-site scope boundary.
    expect(notice).not.toContain("from '../site/site-chrome'");
  });

  it('ships the editorial marketing site: routed nav pages, shared chrome, and no login links', () => {
    // The long single-page landing was split (design handoff, 2026-07-27): the
    // homepage is hero + colophon only, and each nav link is its own route.
    const routes = repoFile('apps/web/src/app/app.tsx');
    const chrome = repoFile('apps/web/src/features/site/site-chrome.tsx');
    const home = repoFile('apps/web/src/features/site/site-home-page.tsx');

    for (const path of ['/how-it-works', '/the-app', '/for-clubs', '/faq']) {
      expect(routes).toContain(`path="${path}"`);
    }
    // The chrome the whole site shares: wordmark, both store badges, the
    // Premium pill out to the existing planner, and the theme flip.
    expect(chrome).toContain('/KSU_Header_Mobile.jpg');
    expect(chrome).toContain('App Store');
    expect(chrome).toContain('Google Play');
    expect(chrome).toContain('ksu-site-premium');
    expect(chrome).toContain('PLANNER_URL');
    // Store badges are pre-launch buttons that open the launch note. A real
    // store href here would be a dead link on the day it ships.
    expect(chrome).not.toContain('apps.apple.com');
    expect(chrome).not.toContain('play.google.com');
    // The marketing surface stays login-free (see docs/decisions.md).
    for (const source of [chrome, home]) {
      expect(source).not.toContain('to="/signin"');
      expect(source).not.toContain('to="/signup"');
    }
    // The cut homepage sections must not creep back. Comments are stripped
    // first — the page's own comment names what was removed.
    const rendered = home.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const cut of ['Why KSU', 'KSU Premium', 'ksu-site-band', 'ksu-site-closer']) {
      expect(rendered, `the homepage must stay trimmed — ${cut} was cut`).not.toContain(cut);
    }
  });

  it('does not restyle or re-route the premium planner', () => {
    // The planner (Google SDK, Claude integration, planner state) is explicitly
    // out of scope for the site rebuild. The site may only LINK to it.
    const content = repoFile('apps/web/src/features/site/site-content.ts');
    const siteCss = repoFile('apps/web/src/features/site/site.css');
    const routes = repoFile('apps/web/src/app/app.tsx');

    expect(content).toContain("export const PLANNER_URL = '/app/planner'");
    // The site stylesheet is scoped to .ksu-site and must not reach planner classes.
    expect(siteCss).not.toMatch(/\.planner-|\.ksu-day|\.map-canvas|\.google-route-map/);
    // The planner route still sits behind the premium gate, unchanged.
    expect(routes).toMatch(/<Route element=\{<PremiumRoute \/>\}>\s*<Route path="planner"/);
  });

  it('ships legal pages, token fallbacks, and both app-association documents', () => {
    for (const path of [
      'privacy/index.html',
      'terms/index.html',
      'support/index.html',
      'delete-account/index.html',
      'invite/index.html',
      'connect/index.html',
      '.well-known/assetlinks.json',
      '.well-known/apple-app-site-association',
    ]) {
      expect(() => publicFile(path)).not.toThrow();
    }

    const headers = publicFile('_headers');
    expect(headers).toMatch(/\/\.well-known\/assetlinks\.json[\s\S]*?Content-Type: application\/json/);
    expect(headers).toMatch(/\/\.well-known\/apple-app-site-association[\s\S]*?Content-Type: application\/json/);
  });

  it('sets privacy headers on Function responses and keeps connection copy distinct', () => {
    const inviteFunction = repoFile('functions/invite/[token].js');
    const connectFunction = repoFile('functions/connect/[token].js');
    // Both Functions now render through one shared builder, so the header set
    // is asserted where it actually lives rather than twice over copy-pasted
    // literals — the duplication is what let the two pages drift apart.
    const shared = repoFile('lib/handoff-page.js');

    expect(handoffHeaders['Cache-Control']).toBe('no-store');
    expect(handoffHeaders['Referrer-Policy']).toBe('no-referrer');
    expect(handoffHeaders['X-Frame-Options']).toBe('DENY');
    expect(handoffHeaders['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(handoffHeaders['Permissions-Policy']).toBeTruthy();
    for (const source of [inviteFunction, connectFunction]) {
      expect(source).toContain('handoffHeaders');
    }

    // The response forbids scripts outright, which is exactly why the app-open
    // affordance below has to be a plain anchor. If a script-src is ever added
    // here, revisit that decision deliberately rather than by accident.
    expect(handoffHeaders['Content-Security-Policy']).toContain("default-src 'none'");
    expect(handoffHeaders['Content-Security-Policy']).not.toContain('script-src');
    expect(shared).not.toMatch(/<script/i);

    expect(inviteFunction).toContain('invited to a KSU ride');
    expect(connectFunction).toContain('A rider wants to connect');
    expect(connectFunction).not.toContain('invited to a KSU ride');
  });

  it('gives a rider a real way into the app from a link an in-app browser opened', () => {
    // The defect this covers (2026-08-25): the token was never read — the
    // handler took no params at all — so the page could not offer any app link,
    // and a rider who opened a KSU link inside Messenger's WebView (which honors
    // neither App Links nor Universal Links) hit a dead end with no next step.
    for (const route of ['connect', 'invite'] as const) {
      const token = 'a'.repeat(43);
      const android = renderHandoffPage({
        route,
        token,
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile',
        noApp: false,
        title: 't', eyebrow: 'e', heading: 'h', body: 'b', assurance: 'a',
      });
      expect(android).toContain('Open in KSU');
      expect(android).toContain(`intent://rideksu.com/${route}/${token}`);
      expect(android).toContain('package=com.kickstandsup.ksu');
      // The Android fallback must come back here, not to a store listing: KSU
      // has no public listing yet, so a store URL would dead-end.
      expect(android).toContain(encodeURIComponent(`https://rideksu.com/${route}/${token}?noapp=1`));
      expect(android).not.toContain('play.google.com');

      const ios = renderHandoffPage({
        route,
        token,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile',
        noApp: false,
        title: 't', eyebrow: 'e', heading: 'h', body: 'b', assurance: 'a',
      });
      expect(ios).toContain(`ksu://${route}/${token}`);
      expect(ios).not.toContain('intent://');
      expect(ios).not.toContain('apps.apple.com');
    }
  });

  it('never emits an app link it cannot honor, and never reflects an unvalidated token', () => {
    const androidUa = 'Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile';
    const base = { route: 'connect' as const, noApp: false, title: 't', eyebrow: 'e', heading: 'h', body: 'b', assurance: 'a' };

    // Desktop: no app link can succeed, so don't pretend one will.
    const desktop = renderHandoffPage({ ...base, token: 'a'.repeat(43), userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' });
    expect(desktop).not.toContain('Open in KSU');
    expect(desktop).toContain('Open this link on the phone');

    // The Android intent fallback returns here with ?noapp=1 — that rider needs
    // the install answer, not the button that just failed for them.
    const noApp = renderHandoffPage({ ...base, token: 'a'.repeat(43), userAgent: androidUa, noApp: true });
    expect(noApp).not.toContain('Open in KSU');
    expect(noApp).toContain('limited testing');

    // A malformed token must never reach an href or the document. The strict
    // charset check is the whole defense — these Functions have no escaping
    // framework behind them.
    for (const hostile of ['"><img src=x onerror=alert(1)>', '../../etc/passwd', 'short', '']) {
      const page = renderHandoffPage({ ...base, token: hostile, userAgent: androidUa });
      expect(page).not.toContain('Open in KSU');
      expect(page).not.toContain('intent://');
      expect(page).not.toContain('<img');
      expect(page).not.toContain('onerror');
    }

    // Legacy UUID links stay redeemable — same contract the app's parser keeps.
    const legacy = renderHandoffPage({ ...base, token: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', userAgent: androidUa });
    expect(legacy).toContain('Open in KSU');
  });
  it('registers the trip-authoring surface: routes, nav, and the URL ownership table', () => {
    const routes = repoFile('apps/web/src/app/app.tsx');
    const shell = repoFile('apps/web/src/app/app-shell.tsx');
    const architecture = repoFile('WEB_ARCHITECTURE.md');

    expect(routes).toContain('path="trips"');
    expect(routes).toContain('path="trips/new"');
    expect(routes).toContain('path="trips/:rideId"');
    expect(routes).toContain('TripAuthoringRoute');
    expect(shell).toContain('Plan a trip');
    expect(architecture).toContain('| `/app/trips` |');
    expect(architecture).toContain('| `/app/trips/new` |');
    expect(architecture).toContain('| `/app/trips/:rideId` |');
  });

  it('wires the Autopilot plan-step default path into the trip editor', () => {
    const editorPage = repoFile('apps/web/src/features/trip-editor-page.tsx');
    // The default-path copy itself lives in autopilot-panel.tsx (extracted so
    // the panel is independently testable — trip-autopilot-spec-2026-07-26
    // §6.1/§6.3); trip-editor-page.tsx is the thing that actually MOUNTS it,
    // gated on the ai.route_assist capability, above the day list.
    const panel = repoFile('apps/web/src/features/autopilot/autopilot-panel.tsx');

    expect(editorPage).toContain('AutopilotPanel');
    expect(editorPage).toContain("hasAccountCapability(snapshot, 'ai.route_assist')");
    expect(panel).toContain('Plan my days for me');
    expect(panel).toContain('I’ll build the days myself');
    expect(panel).toContain('Tune it first');
  });
});
