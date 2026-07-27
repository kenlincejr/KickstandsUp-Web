import { SitePage } from './site-chrome';
import { SITE_COLOPHON } from './site-content';

const HERO = '/site/hero-overlook-2560x1440.jpg';

/**
 * The homepage is deliberately short: hero photo banner + colophon strip, then
 * the footer. The "Why KSU" band, the teaser grid and the closer that used to
 * live here were cut when the long single-page landing was split into the nav
 * pages — do not re-add them (design handoff §Homepage).
 */
export function SiteHomePage() {
  return (
    <SitePage
      title="Kickstands Up — Better rides start here."
      description="KSU is the rider connection app: find riders who ride your way, get a run going, and keep the crew."
    >
      <section className="ksu-site-hero">
        <div className="ksu-site-hero-frame">
          <img
            src={HERO}
            alt="Riders and bikes at a mountain overlook at sunrise, checking the KSU app"
            width={2560}
            height={1440}
            fetchPriority="high"
            decoding="async"
          />
          <div className="ksu-site-hero-scrim" aria-hidden="true" />
          <div className="ksu-site-hero-fade" aria-hidden="true" />
          <div className="ksu-site-hero-text">
            <div className="ksu-site-col">
              <div className="ksu-site-hero-copy">
                <p className="ksu-site-hero-eyebrow"><i aria-hidden="true" />The rider connection app</p>
                <h1>Better rides<br />start <span className="accent">here.</span></h1>
                <p>
                  Riding solo is great. Finding riders who match your pace shouldn’t be.{' '}
                  <strong>KSU fixes that.</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Colophon strip — the poster's spec line. */}
      <div className="ksu-site-col">
        <dl className="ksu-site-spec">
          {SITE_COLOPHON.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SitePage>
  );
}
