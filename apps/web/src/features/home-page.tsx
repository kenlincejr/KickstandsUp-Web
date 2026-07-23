import { useEffect, useRef, useState, type ReactNode } from 'react';

const LOGO = '/KSU_Header_Mobile.jpg';

type Pillar = { step: string; title: string; body: string; icon: ReactNode };
type Feature = { title: string; body: string; icon: ReactNode };

const iconFind = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx={11} cy={11} r={7} /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" /></svg>
);
const iconRun = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17l5-9 4 5 3-4 4 8" /><circle cx={6} cy={19} r={2} /><circle cx={18} cy={19} r={2} /></svg>
);
const iconStay = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9.5} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11" /></svg>
);
const iconRoute = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 20l-5.5 2.5V6L9 3.5m0 16.5 6-2.5m-6 2.5V3.5m6 14 5.5 2.5V6L15 3.5m0 14V3.5m0 0L9 6" /></svg>
);
const iconNav = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x={2} y={6} width={20} height={12} rx={2} /><path d="M8 18v2M16 18v2M6 10l3 3-3 3M13 12h5" /></svg>
);
const iconClub = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9.5} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11" /></svg>
);
const iconAssist = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.1 4.6L19 9l-3.6 3.3.9 4.9L12 15l-4.3 2.2.9-4.9L5 9l4.9-1.4z" /></svg>
);

const pillars: Pillar[] = [
  { step: 'Find a rider', title: 'People who ride your way.', body: 'Match on the bikes, the pace, and the roads you actually like — not just whoever’s nearby. Your next riding buddy is closer than you think.', icon: iconFind },
  { step: 'Get a ride going', title: 'Start the run in seconds.', body: 'Drop a route, set a time, and pull the right people in. Leaders, sweeps, and riders all see one plan — nobody gets lost at the on-ramp.', icon: iconRun },
  { step: 'Stay connected', title: 'Make a friend. Keep the crew.', body: 'The ride ends; the connection doesn’t. Save the people you clicked with and turn one good Saturday into a whole riding season together.', icon: iconStay },
];

const features: Feature[] = [
  { title: 'Multi-point Google routes', body: 'Build the real line — start, must-stops, fuel and photo waypoints, finish — then share one plan with the whole group.', icon: iconRoute },
  { title: 'Turn-by-turn in CarPlay & Android Auto', body: 'Hand the shared route straight to Google Maps or Waze. Everyone rides the same line, right on the dash — no printed directions, no wrong turns.', icon: iconNav },
  { title: 'Club & MC command', body: 'Rosters, roles, events, road-captain tools, and announcements — the officer suite that retires the group text and the spreadsheet.', icon: iconClub },
  { title: 'AI route assist & conditions brief', body: 'Smarter routing plus a weather and road-conditions read before you roll — so the plan holds up when the pack actually shows.', icon: iconAssist },
];

const AppleBadge = (
  <svg className="home-badge-glyph" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
);
const PlayBadge = (
  <svg className="home-badge-glyph" viewBox="0 0 512 512" aria-hidden="true"><path fill="#00D0FF" d="M47 24 300 268 47 488c-9-5-15-15-15-27V51c0-12 6-22 15-27z" /><path fill="#00F076" d="M47 24c8-4 17-4 25 1l253 145-58 58z" /><path fill="#FFC900" d="M383 214l58 33c19 11 19 33 0 44l-58 33-58-58z" /><path fill="#FF3A44" d="M47 488l220-236 58 58L72 487c-8 5-17 5-25 1z" /></svg>
);

function StoreRow({ onOpen }: { onOpen: (store: string) => void }) {
  return (
    <div className="home-stores">
      <button className="home-badge" type="button" onClick={() => onOpen('App Store')} aria-label="Download on the App Store — coming soon">
        {AppleBadge}
        <span className="home-badge-txt"><small>Download on the</small><b>App Store</b></span>
      </button>
      <button className="home-badge" type="button" onClick={() => onOpen('Google Play')} aria-label="Get it on Google Play — coming soon">
        {PlayBadge}
        <span className="home-badge-txt"><small>Get it on</small><b>Google Play</b></span>
      </button>
    </div>
  );
}

function MorseRule() {
  return (
    <div className="home-rule" aria-hidden="true">
      <span className="home-rule-track" />
      <span className="home-code"><i className="dot" /><i className="dash" /><i className="dot" /><i className="dash long" /><i className="dot" /></span>
      <span className="home-rule-track" />
    </div>
  );
}

function ComingSoon({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="home-modal-bg" role="dialog" aria-modal="true" aria-labelledby="ksu-modal-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="home-modal">
        <div className="home-rule small"><span className="home-code"><i className="dot" /><i className="dash" /><i className="dot" /></span><span className="home-rule-track" /></div>
        <h3 id="ksu-modal-title">Almost ready to roll.</h3>
        <p>The KSU app is in final testing and lands on the App Store and Google Play shortly. Kickstands up soon — check back here for the launch.</p>
        <button className="home-modal-close" type="button" ref={closeRef} onClick={onClose}>Got it — see you on the road</button>
      </div>
    </div>
  );
}

export function HomePage() {
  const [dark, setDark] = useState(false);
  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    if (!modal) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal]);

  return (
    <div className={dark ? 'home is-dark' : 'home'}>
      <header className="home-nav">
        <a href="/" className="home-brand" aria-label="Kickstands Up home">
          <img src={LOGO} alt="Kickstands Up" className="home-logo" />
        </a>
        <div className="home-nav-right">
          <span className="home-soon">Launching soon</span>
          <button className="home-theme" type="button" onClick={() => setDark((v) => !v)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
        </div>
      </header>

      <section className="home-hero">
        <p className="home-eyebrow">The rider connection app</p>
        <h1 className="home-h1">Better rides<br />start <span className="accent">here.</span></h1>
        <p className="home-lede">Riding solo is great. But when you <em>want</em> company, finding someone who rides your way is a pain. <strong>KSU makes it easy</strong> — match with riders, start a run, and keep the crew.</p>
        <StoreRow onOpen={setModal} />
        <p className="home-note">Both apps are in final testing — tap either badge for the launch plan.</p>
      </section>

      <MorseRule />

      <section className="home-how" id="how">
        <div className="home-how-head">
          <p className="home-kicker">How it works</p>
          <h2>From &ldquo;we should ride sometime&rdquo; to kickstands up.</h2>
        </div>
        <div className="home-pillars">
          {pillars.map((p) => (
            <article className="home-pillar" key={p.step}>
              <span className="home-pillar-ic">{p.icon}</span>
              <p className="home-pillar-step">{p.step}</p>
              <h3>{p.title}</h3>
              <p className="home-pillar-body">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-band">
        <div className="home-band-inner">
          <p className="home-kicker on-brick">Why KSU</p>
          <p className="home-band-big">Love riding alone? Same. Rounding people up is the hard part.</p>
          <p className="home-band-small">Group texts that die. Plans that fall through. Nobody who rides your pace. GPS apps already nailed the map — KSU fixes the actual headache: finding the right riders and getting everyone rolling.</p>
        </div>
      </section>

      <section className="home-prem" id="premium">
        <div className="home-prem-head">
          <span className="home-prem-tag">KSU Premium</span>
          <h2>Everything you need to lead the ride.</h2>
          <p className="home-prem-sub">Free gets you and your crew rolling. Premium is for the rider who plans the route, calls the shots, and keeps the club running.</p>
        </div>
        <div className="home-prem-grid">
          {features.map((f) => (
            <div className="home-feat" key={f.title}>
              <span className="home-feat-ic">{f.icon}</span>
              <div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="home-prem-note">&hellip;plus your route library, exports, and <b>everything else we&rsquo;ve wired up</b> — all under one upgrade.</p>
      </section>

      <section className="home-closer">
        <h2>Your next crew is already out there.</h2>
        <StoreRow onOpen={setModal} />
      </section>

      <footer className="home-foot">
        <a href="/" className="home-brand"><img src={LOGO} alt="Kickstands Up" className="home-logo small" /></a>
        <nav aria-label="Legal">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="/support/">Support</a>
        </nav>
        <span className="home-copy">&copy; 2026 Kickstands Up. Nobody rides alone.</span>
      </footer>

      {modal ? <ComingSoon onClose={() => setModal(null)} /> : null}
    </div>
  );
}
