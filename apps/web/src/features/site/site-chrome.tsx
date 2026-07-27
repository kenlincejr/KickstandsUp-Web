import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PremiumMark } from '../../design/day-kit';
import { AppleGlyph, GooglePlayGlyph } from '../../design/store-glyphs';
import { PLANNER_URL, SITE_NAV, type SiteNavKey } from './site-content';
import './site.css';

/* The wordmark lockup already shipped with the site; the design bundle's
   assets/logo-wordmark.jpg is byte-identical to it, so there is no second copy. */
const WORDMARK = '/KSU_Header_Mobile.jpg';

/* ----------------------------------------------------------------- icons */

/* 24×24 line icons, inline so the header renders without a second request. */
function icon(inner: ReactNode, width = 1.7) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {inner}
    </svg>
  );
}

export const siteIcons = {
  find: icon(<><circle cx={11} cy={11} r={7} /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" /></>),
  run: icon(<><path d="M4 17l5-9 4 5 3-4 4 8" /><circle cx={6} cy={19} r={2} /><circle cx={18} cy={19} r={2} /></>),
  crew: icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9.5} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11" /></>),
  route: icon(<path d="M9 20l-5.5 2.5V6L9 3.5m0 16.5 6-2.5m-6 2.5V3.5m6 14 5.5 2.5V6L15 3.5m0 14V3.5m0 0L9 6" />, 1.6),
  nav: icon(<><rect x={2} y={6} width={20} height={12} rx={2} /><path d="M8 18v2M16 18v2M6 10l3 3-3 3M13 12h5" /></>, 1.6),
  assist: icon(<path d="M12 3l2.1 4.6L19 9l-3.6 3.3.9 4.9L12 15l-4.3 2.2.9-4.9L5 9l4.9-1.4z" />, 1.6),
  sun: icon(<><circle cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>, 2),
  moon: icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />, 2),
} as const;

/* ------------------------------------------------------------ primitives */

/** The Morse hairline: a dot-dash cadence between two rules. */
export function MorseRule({ compact }: { compact?: boolean } = {}) {
  return (
    <div className="ksu-site-rule" aria-hidden="true">
      {compact ? null : <span className="ksu-site-rule-track" />}
      <span className="ksu-site-code">
        <i className="dot" /><i className="dash" /><i className="dot" />
        {compact ? null : <><i className="dash long" /><i className="dot" /></>}
      </span>
      <span className="ksu-site-rule-track" />
    </div>
  );
}

/**
 * Pre-launch store badge. There are no real store URLs yet, so this is a
 * button that opens the launch note — never a dead link.
 */
export function StoreBadge({ store, size = 'sm' }: { store: 'apple' | 'google'; size?: 'sm' | 'lg' }) {
  const openLaunchNote = useLaunchNote();
  const apple = store === 'apple';
  return (
    <button
      className={size === 'lg' ? 'ksu-site-badge lg' : 'ksu-site-badge'}
      type="button"
      onClick={openLaunchNote}
      aria-label={apple ? 'Download on the App Store — launching soon' : 'Get it on Google Play — launching soon'}
    >
      {apple ? <AppleGlyph className="ksu-site-badge-glyph" /> : <GooglePlayGlyph className="ksu-site-badge-glyph" />}
      <span className="ksu-site-badge-txt">
        <small>{apple ? 'Download on the' : 'Get it on'}</small>
        <b>{apple ? 'App Store' : 'Google Play'}</b>
      </span>
    </button>
  );
}

/** Both badges, side by side. */
export function StoreRow({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <div className="ksu-site-stores">
      <StoreBadge store="apple" size={size} />
      <StoreBadge store="google" size={size} />
    </div>
  );
}

/** Mono kicker + hairline + bolt tick, then the display headline. */
export function SectionHead({ kicker, title, sub, as = 'h2' }: { kicker: string; title: ReactNode; sub?: ReactNode; as?: 'h1' | 'h2' }) {
  const Title = as;
  return (
    <div className="ksu-site-head">
      <div className="ksu-site-head-rule">
        <p className="ksu-site-kicker">{kicker}</p>
        <i aria-hidden="true" />
        <i className="ksu-site-head-bolt" aria-hidden="true" />
      </div>
      <Title>{title}</Title>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

/**
 * A photo drop slot. Real photography has not landed yet, so an empty slot
 * states what belongs there rather than faking it with stock imagery. Pass
 * `src` once the asset exists and the frame fills.
 */
export function PhotoSlot({ src, alt, label }: { src?: string; alt?: string; label: string }) {
  return (
    <div className="ksu-site-slot">
      {src ? <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" /> : <span>{label}</span>}
    </div>
  );
}

/** Olive bezel housing a screenshot slot, with a mono caption. */
export function PhoneFrame({ caption, label, src, stagger }: { caption: string; label: string; src?: string; stagger?: boolean }) {
  return (
    <figure className={stagger ? 'ksu-site-phone stagger' : 'ksu-site-phone'}>
      <div className="ksu-site-phone-bezel">
        <div className="ksu-site-phone-screen">
          <PhotoSlot src={src} label={label} />
        </div>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** MorseRule + headline + both store badges. Closes every nav page. */
export function StoreCloser({ headline, spaced }: { headline: string; spaced?: boolean }) {
  return (
    <section className={spaced ? 'ksu-site-col ksu-site-closer spaced' : 'ksu-site-col ksu-site-closer'}>
      <MorseRule />
      <h2>{headline}</h2>
      <StoreRow size="lg" />
    </section>
  );
}

/* ------------------------------------------------------- launch-note modal */

const LaunchNoteContext = createContext<() => void>(() => {});

/** Opens the pre-launch note. Any store badge, anywhere on the site. */
export function useLaunchNote() {
  return useContext(LaunchNoteContext);
}

function LaunchNote({ onClose }: { onClose: () => void }) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dismissRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ksu-site-modal-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ksu-site-launch-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="ksu-site-modal">
        <MorseRule compact />
        <h2 id="ksu-site-launch-title">Almost ready to roll.</h2>
        <p>The KSU app is in final testing and lands on the App Store and Google Play shortly. Kickstands up soon — check back here for the launch.</p>
        <button ref={dismissRef} type="button" onClick={onClose}>Got it — see you on the road</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ theme */

const THEME_KEY = 'ksu-site-theme';

function readStoredTheme(): boolean {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    // Private-mode / blocked storage: day mode is the default, not an error.
    return false;
  }
}

/* ----------------------------------------------------------------- chrome */

function PremiumPill() {
  // A plain link out to the EXISTING planner route — no modal, no behaviour.
  // The planner itself is out of scope and unchanged.
  return (
    <Link className="ksu-site-premium" to={PLANNER_URL}>
      <PremiumMark />
      <span>Premium</span>
    </Link>
  );
}

function NavLinks({ active }: { active: SiteNavKey | null }) {
  return (
    <>
      {SITE_NAV.map((link) => (
        <NavLink key={link.key} to={link.to} aria-current={active === link.key ? 'page' : undefined}>
          {link.label}
        </NavLink>
      ))}
      <PremiumPill />
    </>
  );
}

function SiteHeader({ active, dark, onToggleTheme }: { active: SiteNavKey | null; dark: boolean; onToggleTheme: () => void }) {
  return (
    <header className="ksu-site-header">
      <div className="ksu-site-col ksu-site-header-bar">
        <Link className="ksu-site-brand" to="/" aria-label="Kickstands Up home">
          <img src={WORDMARK} alt="Kickstands Up" />
        </Link>
        <nav className="ksu-site-nav" aria-label="Site">
          <NavLinks active={active} />
        </nav>
        <div className="ksu-site-header-right">
          <div className="ksu-site-header-stores">
            <StoreBadge store="apple" />
            <StoreBadge store="google" />
          </div>
          <span className="ksu-site-soon">Launching soon</span>
          <button
            className="ksu-site-theme"
            type="button"
            onClick={onToggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dark ? siteIcons.sun : siteIcons.moon}
          </button>
        </div>
      </div>
      {/* The centre nav hides under 1080px; these are the same links so a phone
          is never left without navigation. */}
      <nav className="ksu-site-col ksu-site-mobile-nav" aria-label="Site (compact)">
        <NavLinks active={active} />
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="ksu-site-col ksu-site-foot">
      <Link className="ksu-site-brand" to="/" aria-label="Kickstands Up home">
        <img src={WORDMARK} alt="Kickstands Up" />
      </Link>
      <nav aria-label="Legal">
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
        <a href="/support/">Support</a>
      </nav>
      <span className="ksu-site-copy">© 2026 Kickstands Up · Nobody rides alone</span>
    </footer>
  );
}

/**
 * The one shell every marketing page renders inside: sticky header, footer,
 * theme flip, launch-note modal, and the per-route document title. Pages supply
 * content only, so the chrome cannot drift between them.
 */
export function SitePage({
  active = null,
  title,
  description,
  children,
}: {
  active?: SiteNavKey | null;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [dark, setDark] = useState(readStoredTheme);
  const [launchNote, setLaunchNote] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'day');
    } catch {
      // Nothing to do — the flip still works for this session.
    }
  }, [dark]);

  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute('content', description);
  }, [title, description]);

  const openLaunchNote = useCallback(() => setLaunchNote(true), []);
  const launchNoteValue = useMemo(() => openLaunchNote, [openLaunchNote]);

  return (
    <LaunchNoteContext.Provider value={launchNoteValue}>
      <div className={dark ? 'ksu-site is-dark' : 'ksu-site'}>
        <SiteHeader active={active} dark={dark} onToggleTheme={() => setDark((value) => !value)} />
        {children}
        <SiteFooter />
        {launchNote ? <LaunchNote onClose={() => setLaunchNote(false)} /> : null}
      </div>
    </LaunchNoteContext.Provider>
  );
}
