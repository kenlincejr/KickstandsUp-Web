import { SectionHead, SitePage } from './site-chrome';
import { SITE_FAQ } from './site-content';

/** Six straight answers, two columns. No closer — the answers are the point. */
export function FaqPage() {
  return (
    <SitePage
      active="faq"
      title="FAQ — Kickstands Up"
      description="What KSU is and what it isn’t: not a navigation app, no location sharing, free to start, built for clubs, iPhone and Android."
    >
      <section className="ksu-site-col ksu-site-block">
        <SectionHead as="h1" kicker="Straight answers" title="What KSU is, and what it isn’t." />
        <div className="ksu-site-faq">
          {SITE_FAQ.map((item) => (
            <div key={item.q}>
              <h2>{item.q}</h2>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </SitePage>
  );
}
