import { StampChip } from '../../design/day-kit';

/**
 * The shared-plan artefact, as the club page shows it: a torn-stub ride ticket.
 * This is marketing illustration, not live data — the props are the same shape
 * the design system's `RideTicket` takes so a real ride can be piped in later.
 */
export function RideTicket({
  title,
  caption,
  vibe,
  riderCount,
  isLeading,
  facts,
  cta,
}: {
  title: string;
  caption: string;
  vibe?: string;
  riderCount: number;
  isLeading?: boolean;
  facts: string;
  cta: string;
}) {
  return (
    <article className="ksu-site-ticket">
      <div className="ksu-site-ticket-top">
        <div>
          <h3>{title}</h3>
          <p className="ksu-site-ticket-when">{caption}</p>
        </div>
        <div className="ksu-site-ticket-riders">
          <b>{riderCount}</b>
          <span>riders in</span>
        </div>
      </div>
      <div className="ksu-site-ticket-perf" aria-hidden="true" />
      <div className="ksu-site-ticket-facts">
        {isLeading ? <StampChip label="You’re leading" tone="moss" /> : null}
        {vibe ? <StampChip label={vibe} tone="brass" /> : null}
        <span>{facts}</span>
      </div>
      <div className="ksu-site-ticket-cta">
        <span>{cta}</span>
        <span aria-hidden="true">›</span>
      </div>
    </article>
  );
}
