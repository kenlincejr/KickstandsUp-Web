import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('provides a public sign-in path with the same providers as the app', () => {
    const home = repoFile('apps/web/src/features/home-page.tsx');
    const signIn = repoFile('apps/web/src/features/auth/sign-in-page.tsx');
    const auth = repoFile('apps/web/src/features/auth/auth-context.tsx');
    const routes = repoFile('apps/web/src/app/app.tsx');

    expect(home).toContain('to="/signin"');
    expect(home).toContain('Sign in to KSU');
    expect(signIn).toContain('Continue with Google');
    expect(signIn).toContain('Continue with Apple');
    expect(auth).toContain("provider: 'google' | 'apple'");
    expect(routes).toContain('path="/login"');
    expect(routes).toContain('to="/signin"');
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

    for (const source of [inviteFunction, connectFunction]) {
      expect(source).toContain('"Cache-Control": "no-store"');
      expect(source).toContain('"Content-Security-Policy"');
      expect(source).toContain('"Permissions-Policy"');
      expect(source).toContain('"Referrer-Policy": "no-referrer"');
      expect(source).toContain('"X-Frame-Options": "DENY"');
      expect(source).toContain('"X-Robots-Tag": "noindex, nofollow"');
    }

    expect(inviteFunction).toContain('invited to a KSU ride');
    expect(connectFunction).toContain('A rider wants to connect');
    expect(connectFunction).not.toContain('invited to a KSU ride');
  });
});
