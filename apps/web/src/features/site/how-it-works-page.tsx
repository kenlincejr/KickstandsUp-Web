import { PhotoSlot, SitePage, StoreCloser } from './site-chrome';
import { SITE_STEPS } from './site-content';

/** The three-step story that used to sit on the long homepage. */
export function HowItWorksPage() {
  return (
    <SitePage
      active="how"
      title="How it works — Kickstands Up"
      description="Three steps from “we should ride sometime” to kickstands up: find a rider, get a ride going, keep the crew."
    >
      <section className="ksu-site-col ksu-site-intro">
        <p className="ksu-site-kicker">How it works</p>
        <h1>From “we should ride sometime” to kickstands up.</h1>
        <p>Three steps, no group text required.</p>
      </section>

      <section className="ksu-site-col ksu-site-body">
        <div className="ksu-site-steps">
          {SITE_STEPS.map((step) => (
            <div className="ksu-site-step" key={step.n}>
              <div>
                <p className="ksu-site-step-n">{step.n}</p>
                <p className="ksu-site-step-label">{step.step}</p>
              </div>
              <div className="ksu-site-step-body">
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </div>
              <div className="ksu-site-step-photo">
                <PhotoSlot label={step.slot} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <StoreCloser headline="Ready to find your next ride?" />
    </SitePage>
  );
}
