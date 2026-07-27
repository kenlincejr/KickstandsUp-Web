import { PhoneFrame, SectionHead, SitePage, StoreCloser, siteIcons } from './site-chrome';
import { SITE_FEATURES } from './site-content';

/** Phone showcase + the two route-level capabilities under the hood. */
export function TheAppPage() {
  return (
    <SitePage
      active="app"
      title="The app — Kickstands Up"
      description="Status, the next ride, who’s out, and the weather — the KSU app opens on what you were going to check anyway."
    >
      <section className="ksu-site-col ksu-site-top">
        <SectionHead
          as="h1"
          kicker="The app"
          title="Everything the ride needs, on one screen."
          sub="Status, the next ride, who’s out, and the weather — the app opens on what you were going to check anyway."
        />
        <div className="ksu-site-phones">
          <PhoneFrame caption="Home · status + next ride" label="Home screenshot" />
          <PhoneFrame caption="Discover · rides near you" label="Discover screenshot" stagger />
          <PhoneFrame caption="Planner · the whole line" label="Route planner screenshot" />
        </div>
      </section>

      <section className="ksu-site-band">
        <div className="ksu-site-col">
          <SectionHead kicker="Under the hood" title="Built on routes, not just pins." />
          <div className="ksu-site-tiles">
            {SITE_FEATURES.slice(0, 2).map((feature) => (
              <div className="ksu-site-tile" key={feature.title}>
                <span className="ksu-site-tile-ic">{siteIcons[feature.icon]}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <StoreCloser headline="Download it. Try it Saturday." spaced />
    </SitePage>
  );
}
