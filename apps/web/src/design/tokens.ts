// The canonical KSU day-mode token set for the web.
//
// These are the EXACT values from the installed app's
// `src/constants/day-theme.ts` (KickstandsUp repo). The app is the source of
// truth; nothing here may be re-tuned. A rider moving from the phone to
// rideksu.com must not see a second palette.
//
// The semantics travel with the values and are load-bearing:
//   rust  = the ONE forward-action accent. Never reused for passive or done.
//   moss  = done / confirmed.
//   brass = context / progress (eyebrows, section rules, premium provenance).
//
// `day-kit.css` declares the same values as CSS custom properties; the test
// beside this file asserts the two never drift apart.

export const DayTheme = {
  paper: '#F1ECD9', // primary background — warm parchment
  paperDeep: '#E7DFC1', // secondary panel background (recessed areas)
  card: '#FBF8EF', // elevated card surface
  ink: '#262E1E', // primary text
  inkSoft: '#5B6350', // secondary/muted text
  simLine: '#D2C6A0', // hairline borders
  brass: '#8C6A22', // context/progress accent
  rust: '#9C4315', // the ONE accent for forward-moving actions
  moss: '#3F5A34', // "done"/confirmed state
} as const;

export type DayThemeColor = keyof typeof DayTheme;

/** The only sanctioned dark surface on a day-mode screen (day-kit `Plaque`). */
export const PlaqueColors = {
  olive: '#1F2715', // BrandColors.olive
  edge: 'rgba(198,161,79,0.55)',
} as const;

/** The app's spacing scale (src/constants/theme.ts), in px. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * The rally-poster display face. Bebas ships a single 400 cut — asking for a
 * heavier weight falls back to a different face entirely (the app's recurring
 * `fontWeight: 'normal'` rule). Every rule in day-kit.css that sets this
 * family also pins `font-weight: 400`.
 */
export const DisplayFont = '"Bebas Neue"';

/** CSS custom-property name for each day token — the contract day-kit.css implements. */
export const dayTokenCssVariables: Readonly<Record<DayThemeColor, string>> = {
  paper: '--ksu-paper',
  paperDeep: '--ksu-paper-deep',
  card: '--ksu-card',
  ink: '--ksu-ink',
  inkSoft: '--ksu-ink-soft',
  simLine: '--ksu-line',
  brass: '--ksu-brass',
  rust: '--ksu-rust',
  moss: '--ksu-moss',
};

export type StampTone = 'neutral' | 'moss' | 'brass' | 'rust';

/** The four sanctioned chip tones — the one chip language for the whole product. */
export const stampTones: readonly StampTone[] = ['neutral', 'moss', 'brass', 'rust'] as const;

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export const buttonVariants: readonly ButtonVariant[] = ['primary', 'secondary', 'text', 'danger'] as const;
