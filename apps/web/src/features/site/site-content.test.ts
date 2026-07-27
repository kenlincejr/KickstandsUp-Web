import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DayTheme } from '../../design/tokens';
import { PLANNER_URL, SITE_CLUB_TOOLS, SITE_COLOPHON, SITE_FAQ, SITE_FEATURES, SITE_NAV, SITE_STEPS } from './site-content';

const siteCss = readFileSync(fileURLToPath(new URL('./site.css', import.meta.url)), 'utf8');
// Declarations only — a comment is allowed to name a hex it is retiring.
const siteCssDeclarations = siteCss.replace(/\/\*[\s\S]*?\*\//g, '');

describe('marketing site content', () => {
  it('keeps the four nav pages, in order, pointing at real routes', () => {
    expect(SITE_NAV.map((link) => link.key)).toEqual(['how', 'app', 'clubs', 'faq']);
    expect(SITE_NAV.map((link) => link.label)).toEqual(['How it works', 'The app', 'For clubs', 'FAQ']);
    expect(SITE_NAV.map((link) => link.to)).toEqual(['/how-it-works', '/the-app', '/for-clubs', '/faq']);
  });

  it('points the Premium pill at the existing planner route and nothing else', () => {
    expect(PLANNER_URL).toBe('/app/planner');
  });

  it('ships the section counts the design calls for', () => {
    expect(SITE_COLOPHON).toHaveLength(4);
    expect(SITE_STEPS.map((step) => step.n)).toEqual(['01', '02', '03']);
    expect(SITE_CLUB_TOOLS).toHaveLength(5);
    expect(SITE_FEATURES).toHaveLength(4);
    expect(SITE_FAQ).toHaveLength(6);
  });

  it('answers the six questions the FAQ is required to answer', () => {
    const questions = SITE_FAQ.map((item) => item.q).join(' | ');
    for (const topic of ['navigation app', 'share my location', 'cost', 'club', 'download', 'iPhone and Android']) {
      expect(questions).toContain(topic);
    }
    // The two promises the rest of the product is built on.
    expect(SITE_FAQ[0]!.a).toContain('Google Maps or Waze');
    expect(SITE_FAQ[1]!.a).toContain('never shared');
  });
});

describe('marketing site stylesheet', () => {
  it('declares every --site-* token the handoff names', () => {
    for (const token of [
      '--site-ground',
      '--site-accent',
      '--site-text',
      '--site-text-soft',
      '--site-text-mute',
      '--site-hair',
      '--site-hair-soft',
      '--site-panel',
      '--site-premium-bg',
      '--font-site-display',
      '--font-mono',
      '--font-body',
      '--site-h1-tracking',
      '--site-h2-tracking',
      '--radius-site-panel',
      '--radius-site-modal',
      '--scrim-site',
    ]) {
      expect(siteCssDeclarations, `site.css must declare ${token}`).toContain(`${token}:`);
    }
  });

  it('aliases the canonical day tokens instead of carrying its own copy of the palette', () => {
    // Same rule as design/tokens.test.ts: one palette for app, planner and site.
    for (const value of Object.values(DayTheme)) {
      expect(siteCssDeclarations, `site.css hardcodes ${value} — alias the --ksu-* token instead`).not.toContain(value);
    }
    expect(siteCssDeclarations).toContain('--site-ground: var(--ksu-paper)');
    expect(siteCssDeclarations).toContain('--site-accent: var(--ksu-rust)');
  });

  it('does not reintroduce the retired third marketing palette', () => {
    for (const stale of ['#F3EDDA', '#93231E', '#761B17', '"Helvetica Neue"']) {
      expect(siteCssDeclarations, `site.css must not reintroduce ${stale}`).not.toContain(stale);
    }
  });

  it('pins font-weight 400 wherever it asks for the Bebas display face', () => {
    // Bebas ships one 400 cut and :root sets font-synthesis: none, so a 700/800
    // request silently renders a different face (the app's DisplayFont trap).
    const displayRules = siteCssDeclarations.split('}').filter((block) => block.includes('--font-site-display)'));
    expect(displayRules.length).toBeGreaterThan(8);
    for (const rule of displayRules) {
      expect(rule, `display-face rule missing font-weight: 400 —${rule}`).toContain('font-weight: 400');
    }
  });

  it('stays scoped to .ksu-site so it cannot leak into the app or planner', () => {
    for (const selector of siteCssDeclarations.matchAll(/(^|\n)\s*([.:][^{}\n]*?)\s*\{/g)) {
      const selectorText = selector[2]!;
      expect(selectorText, `${selectorText} escapes the .ksu-site scope`).toMatch(/\.ksu-site/);
    }
  });
});
