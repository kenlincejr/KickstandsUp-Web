// Copy and structure for the public rideksu.com marketing site.
//
// Every string here is final design copy (Field Guide editorial rebuild,
// design_handoff_homepage/README.md). It lives in one module so the pages stay
// layout-only and the site-content test can assert the nav table, the planner
// hand-off URL, and the answers the FAQ is required to give.

/** The Premium pill points at the EXISTING planner route. Out of scope to change. */
export const PLANNER_URL = '/app/planner';

export type SiteNavKey = 'how' | 'app' | 'clubs' | 'faq';

export type SiteNavLink = { key: SiteNavKey; label: string; to: string };

/** Center nav, in order. The Premium pill is rendered after these, not in them. */
export const SITE_NAV: readonly SiteNavLink[] = [
  { key: 'how', label: 'How it works', to: '/how-it-works' },
  { key: 'app', label: 'The app', to: '/the-app' },
  { key: 'clubs', label: 'For clubs', to: '/for-clubs' },
  { key: 'faq', label: 'FAQ', to: '/faq' },
] as const;

/** Homepage colophon strip — the poster's spec line, four columns. */
export const SITE_COLOPHON: readonly { label: string; detail: string }[] = [
  { label: 'Multi-point routes', detail: 'Start, fuel, food, finish' },
  { label: 'CarPlay & Android Auto', detail: 'Turn-by-turn on the dash' },
  { label: 'Club & MC tools', detail: 'Roster, roles, announcements' },
  { label: 'Friends-only presence', detail: 'Location never shared' },
] as const;

export type SiteStep = { n: string; step: string; title: string; body: string; slot: string };

/** How it works — three numbered editorial rows. */
export const SITE_STEPS: readonly SiteStep[] = [
  {
    n: '01',
    step: 'Find a rider',
    title: 'People who ride your way.',
    body: 'Match on the bikes, the pace, and the roads you actually like — not just whoever happens to be nearby.',
    slot: 'Two riders, bikes parked',
  },
  {
    n: '02',
    step: 'Get a ride going',
    title: 'Start the run in seconds.',
    body: 'Drop a route, set a time, pull the right people in. Leaders, sweeps, and riders all see one plan — nobody gets lost at the on-ramp.',
    slot: 'Group rolling out',
  },
  {
    n: '03',
    step: 'Keep the crew',
    title: 'The ride ends; the connection doesn’t.',
    body: 'Save the people you clicked with and turn one good Saturday into a whole riding season together.',
    slot: 'Crew at a rest stop',
  },
] as const;

/** For clubs — the officer checklist. */
export const SITE_CLUB_TOOLS: readonly { label: string; detail: string }[] = [
  { label: 'Roster & roles', detail: 'Officers, road captains, sweeps, prospects — who’s who, on one screen.' },
  { label: 'Route library', detail: 'Every line the club has ridden, saved and ready to re-post.' },
  { label: 'Announcements', detail: 'One post reaches the roster. No group text, no spreadsheet.' },
  { label: 'Roll call', detail: 'Who’s in, who dropped, who’s late — before you pull out of the lot.' },
  { label: 'Ride roles on the day', detail: 'Assign lead and sweep so the pack knows the order.' },
] as const;

export type SiteIconName = 'find' | 'run' | 'crew' | 'route' | 'nav' | 'assist';

export type SiteFeature = { title: string; body: string; icon: SiteIconName };

/** The app — "under the hood" tiles. The first two run on the-app page. */
export const SITE_FEATURES: readonly SiteFeature[] = [
  {
    title: 'Multi-point Google routes',
    body: 'Build the real line — start, must-stops, fuel and photo waypoints, finish — then share one plan with the whole group.',
    icon: 'route',
  },
  {
    title: 'Turn-by-turn in CarPlay & Android Auto',
    body: 'Hand the shared route straight to Google Maps or Waze. Everyone rides the same line, right on the dash.',
    icon: 'nav',
  },
  {
    title: 'Club & MC command',
    body: 'Rosters, roles, events, road-captain tools, and announcements — the officer suite that retires the group text.',
    icon: 'crew',
  },
  {
    title: 'AI route assist & conditions brief',
    body: 'Smarter routing plus a weather and road-conditions read before you roll — so the plan holds when the pack shows.',
    icon: 'assist',
  },
] as const;

/** FAQ — six pairs, two columns. */
export const SITE_FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Is KSU a navigation app?',
    a: 'No. GPS apps already nailed the map. KSU plans the ride and rounds up the riders, then hands the route to Google Maps or Waze for turn-by-turn.',
  },
  {
    q: 'Do I have to share my location?',
    a: 'No. Going online shares your status only with accepted friends. Your location and route are never shared.',
  },
  {
    q: 'What does it cost?',
    a: 'Free gets you and your crew rolling. Premium is for the rider who plans the route, calls the shots, and keeps the club running.',
  },
  {
    q: 'Can my club use it?',
    a: 'Yes — rosters, roles, events, announcements and road-captain tools are built for clubs and MCs.',
  },
  {
    q: 'When can I download it?',
    a: 'Both apps are in final testing and land on the App Store and Google Play shortly. Tap either badge for the launch plan.',
  },
  {
    q: 'Does it work on iPhone and Android?',
    a: 'Both, from day one — plus rideksu.com for planning routes on a bigger screen.',
  },
] as const;
