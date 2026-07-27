import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DayTheme, PlaqueColors, Spacing, dayTokenCssVariables, stampTones } from './tokens';

const dayKitCss = readFileSync(fileURLToPath(new URL('./day-kit.css', import.meta.url)), 'utf8');
// Declarations only — a comment is allowed to name a hex it is retiring.
const stylesCss = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * These values are copied from the installed app's
 * `src/constants/day-theme.ts`. They are duplicated as literals here on
 * purpose: if someone "improves" a hue in tokens.ts, this test is what says no.
 */
const APP_DAY_THEME = {
  paper: '#F1ECD9',
  paperDeep: '#E7DFC1',
  card: '#FBF8EF',
  ink: '#262E1E',
  inkSoft: '#5B6350',
  simLine: '#D2C6A0',
  brass: '#8C6A22',
  rust: '#9C4315',
  moss: '#3F5A34',
} as const;

describe('KSU day tokens', () => {
  it('matches the installed app DayTheme exactly', () => {
    expect(DayTheme).toEqual(APP_DAY_THEME);
  });

  it('matches the app spacing scale', () => {
    expect(Spacing).toEqual({ half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 });
  });

  it('declares every token as a CSS custom property with the same value', () => {
    for (const [name, cssVariable] of Object.entries(dayTokenCssVariables)) {
      const value = DayTheme[name as keyof typeof DayTheme];
      expect(dayKitCss, `${cssVariable} must be declared as ${value}`).toContain(`${cssVariable}: ${value};`);
    }
    expect(dayKitCss).toContain(`--ksu-olive: ${PlaqueColors.olive};`);
  });

  it('paints a chip class for every sanctioned tone', () => {
    for (const tone of stampTones) {
      if (tone === 'neutral') continue;
      expect(dayKitCss).toContain(`.ksu-chip-${tone}`);
    }
  });
});

describe('one palette, not three', () => {
  it('routes the legacy planner --fg-* scope at the shared tokens instead of re-declaring hexes', () => {
    for (const [name, cssVariable] of Object.entries(dayTokenCssVariables)) {
      const value = DayTheme[name as keyof typeof DayTheme];
      // The planner scope may alias the token; it may not carry its own copy.
      expect(stylesCss, `styles.css still hardcodes ${value} — alias var(${cssVariable}) instead`).not.toContain(value);
    }
  });

  it('does not keep the old divergent .home palette', () => {
    // The marketing page used to run a third day-mode: #F3EDDA ground,
    // #93231E accent, Helvetica Neue display. All three are gone.
    for (const stale of ['#F3EDDA', '#93231E', '#761B17', '#2E331A', '"Helvetica Neue"']) {
      expect(stylesCss, `.home must not reintroduce ${stale}`).not.toContain(stale);
    }
  });

  it('keeps the dark marketing theme intact for the public pages', () => {
    expect(stylesCss).toContain('--orange: #f5a623;');
    expect(stylesCss).toContain('.marketing-page');
  });
});
