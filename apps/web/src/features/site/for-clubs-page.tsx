import { StampChip } from '../../design/day-kit';
import { RideTicket } from './ride-ticket';
import { SectionHead, SitePage, StoreCloser } from './site-chrome';
import { SITE_CLUB_TOOLS } from './site-content';

/** Officer tools on the left, the shared plan they produce on the right. */
export function ForClubsPage() {
  return (
    <SitePage
      active="clubs"
      title="For clubs — Kickstands Up"
      description="Roster, route library, announcements, roll call and ride roles — the officer tools that retire the group text."
    >
      <section className="ksu-site-col ksu-site-block">
        <div className="ksu-site-clubs">
          <div>
            <SectionHead
              as="h1"
              kicker="For clubs & road captains"
              title="Run the pack, not the group text."
              sub="You are the one who plans the route, posts the time, and answers the questions. KSU gives you the officer tools to do it once."
            />
            <ul className="ksu-site-checklist">
              {SITE_CLUB_TOOLS.map((tool) => (
                <li key={tool.label}>
                  <span aria-hidden="true">✓</span>
                  <p><b>{tool.label}</b> <em>— {tool.detail}</em></p>
                </li>
              ))}
            </ul>
          </div>
          <div className="ksu-site-clubs-aside">
            <RideTicket
              title="Skyline → Pescadero loop"
              caption="Sat 9:00 am · Jul 25 · Alice’s Restaurant"
              vibe="Spirited"
              riderCount={14}
              isLeading
              facts="92 mi · 1 fuel stop · back by 3"
              cta="Manage your ride"
            />
            <div className="ksu-site-chips">
              <StampChip label="Lead assigned" tone="moss" />
              <StampChip label="Sweep assigned" tone="moss" />
              <StampChip label="Fuel stop set" tone="brass" />
              <StampChip label="Roll call open" tone="rust" />
            </div>
            <p className="ksu-site-caption">One post. The whole roster sees the same plan.</p>
          </div>
        </div>
      </section>

      <StoreCloser headline="Bring the whole club onto KSU." />
    </SitePage>
  );
}
