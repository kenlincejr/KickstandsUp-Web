import { useCapabilities } from './capability-context';

const tools = [
  ['Calendar', 'Build rides, meetings, socials, and dealership events.'],
  ['Roster', 'Manage membership, display titles, and narrowly scoped permissions.'],
  ['Ride day', 'Assign lead and sweep, track acceptance, check riders in, and export attendance.'],
  ['Waiver status', 'Track received and expiry status without turning KSU into a legal-document vault.'],
  ['Announcements', 'Publish once; deliver asynchronously without blocking officer work.'],
  ['Audit trail', 'Review sensitive changes with actor, target, reason, and timestamp.'],
] as const;

export function ClubConsolePage() {
  const { loading, snapshot } = useCapabilities();
  if (loading) return <section className="tool-page">Checking your club access…</section>;
  if (snapshot.projectionState !== 'ready') return <section className="tool-page locked-feature"><p className="kicker">CLUB COMMAND</p><h1>Club access can't be confirmed.</h1><p>KSU won't guess at membership or officer permissions while the server projection is {snapshot.projectionState}.</p></section>;
  if (!snapshot.clubCapabilities.some((scope) => scope.capabilities.includes('club.read'))) return <section className="tool-page locked-feature"><p className="kicker">CLUB COMMAND</p><h1>No active club access yet.</h1><p>Premium and club membership are separate. This account does not currently have a server-confirmed club membership.</p></section>;
  return <section className="tool-page club-console"><header className="tool-header"><div><p className="kicker">CLUB COMMAND</p><h1>Your chapter, one clean cockpit.</h1><p>The layout is ready; server-authored club capabilities remain the gate before live management tools are enabled.</p></div></header><div className="club-tool-grid">{tools.map(([title, body]) => <article key={title}><span>FOUNDATION</span><h2>{title}</h2><p>{body}</p><button type="button" disabled>Requires club permission</button></article>)}</div></section>;
}
