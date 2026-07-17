import { Link } from 'react-router-dom';

const pillars = [
  ['Plan it', 'Shape a route around fuel range, must-stop waypoints, regroup points, and the kind of roads you came to ride.'],
  ['Run it', 'Publish one route revision to the ride so leaders, sweeps, and riders are looking at the same plan.'],
  ['Keep the club moving', 'Handle calendars, rosters, sign-in, waiver status, announcements, and officer handoffs without another spreadsheet.'],
] as const;

export function HomePage() {
  return (
    <main className="marketing-page">
      <header className="site-header">
        <a className="wordmark" href="/">KSU</a>
        <nav aria-label="Primary">
          <a href="#clubs">Clubs &amp; MCs</a>
          <a href="#planner">Route planner</a>
          <Link to="/shop">Shop</Link>
          <Link className="nav-cta" to="/signup">Join KSU</Link>
        </nav>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">KICKSTANDS UP</p>
          <h1>Better rides start with one clear plan.</h1>
          <p className="hero-copy">Build the route, rally the right riders, and keep the whole crew in sync—from the big screen to the bike.</p>
          <div className="button-row"><Link className="primary-button" to="/signup">Create your KSU account</Link><Link className="secondary-button" to="/signin">Sign in</Link></div>
        </div>
        <div className="route-card" aria-label="Route preview illustration">
          <div className="route-card-top"><span>BLUE RIDGE RUN</span><strong>REV 04</strong></div>
          <div className="route-line"><i>1</i><span /><i>2</i><span /><i>3</i><span /><i>4</i></div>
          <div className="route-meta"><span>184 mi</span><span>5h 12m</span><span>2 fuel stops</span></div>
          <p>Saved to Saturday Mountain Crew</p>
        </div>
      </section>
      <section className="pillar-grid" aria-label="KSU workflow">
        {pillars.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{body}</p></article>)}
      </section>
      <section className="feature-section" id="planner"><p className="kicker">KSU ROUTE LAB</p><h2>A waypoint builder that thinks like a ride leader.</h2><p>Google powers the map. KSU owns the ride workflow: must-stop versus shaping points, fuel legs, route revisions, club libraries, publish readiness, and instant handoff to the app.</p></section>
      <section className="feature-section club-section" id="clubs"><p className="kicker">CLUB COMMAND</p><h2>Full-fidelity officer tools belong on the big screen.</h2><p>The app handles ride day. The website handles the work before and after it—calendar, roster, roles, attendance, waiver status, announcements, exports, and a durable audit trail.</p></section>
      <footer><span>© 2026 Kickstands Up</span><nav><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/support/">Support</a></nav></footer>
    </main>
  );
}
