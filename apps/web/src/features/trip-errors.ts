// Server-error → rider-copy mapping for the three trip write RPCs (P6 spec
// §10.2). Match on SQLSTATE plus a message discriminator; never render the
// raw server string — those are written for an engineer reading a log.

export type TripErrorCopy = {
  message: string;
  /** 1-based day the error names, when the server named one. */
  dayNumber?: number;
  /** True when retrying cannot help (trip locked). Do not offer a retry. */
  terminal?: boolean;
  /** True when this should never reach a rider — log it loudly as a bug. */
  clientBug?: boolean;
  /** True when the session should be refreshed and the call retried once. */
  sessionExpired?: boolean;
  /** True when a 42501 from create_trip_ride means capability/entitlement drift. */
  contractDrift?: boolean;
};

const GENERIC = 'KSU couldn’t save that plan. Reload the page and try again.';

function dayFrom(message: string): number | undefined {
  const match = /day (\d+)/i.exec(message);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function riderCopyForTripError(code: string | undefined, rawMessage: string | undefined, context?: { dateRangeLabel?: string }): TripErrorCopy {
  const message = rawMessage ?? '';
  const dayNumber = dayFrom(message);

  if (code === '28000') {
    return { message: 'Your session expired. Sign in again — your day plan is still here.', sessionExpired: true };
  }
  if (code === '42501') {
    if (message.includes('Premium feature')) {
      // Unreachable when the routes.plan.web gate is working; if it fires, the
      // capability projection and the entitlement disagree. Contract drift.
      return { message: 'Multi-day trips are part of Premium.', contractDrift: true };
    }
    return { message: 'Only the rider who created this trip can change it.' };
  }
  if (code === '55000') {
    return { message: 'This trip has already started or been closed, so the plan is locked. Riders can still see it.', terminal: true };
  }
  if (code === '23514') {
    // Discriminate on constraint NAMES: every 23514 message contains the word
    // "check", so a bare includes('check') would swallow all of them.
    if (message.includes('booking_url')) return { message: 'A booking link has to start with http:// or https:// and contain no spaces.' };
    if (message.includes('trip_span')) return { message: 'Those dates don’t work — a trip needs an end after its start, within 30 days.' };
    if (message.includes('ride_trip_legs_check')) return { message: 'A day’s target arrival is before its departure, or a check-out is before its check-in.' };
    return { message: GENERIC, clientBug: true };
  }
  if (code === '22023') {
    if (message.includes('not a trip')) return { message: 'This ride isn’t a multi-day trip.', clientBug: true };
    if (message.includes('start date and a later end date')) return { message: 'The end date has to be after the start date.' };
    if (message.includes('span up to 30 days')) return { message: 'A trip can cover up to 30 days.' };
    if (message.includes('ordered list')) return { message: GENERIC, clientBug: true };
    if (message.includes('at least one day')) return { message: 'Add at least one day before saving.' };
    if (message.includes('is malformed')) return { message: GENERIC, dayNumber, clientBug: true };
    if (message.includes('needs a departure time')) return { message: `Day ${dayNumber ?? '?'} needs a departure time.`, dayNumber };
    if (message.includes('must run in order')) {
      const pair = /day (\d+) starts before day (\d+)/i.exec(message);
      return pair
        ? { message: `Day ${pair[1]} leaves before day ${pair[2]}. Days have to run forward.`, dayNumber: Number(pair[1]) }
        : { message: 'Days have to run forward — one leaves before the day ahead of it.', dayNumber };
    }
    if (message.includes('falls outside')) {
      const range = context?.dateRangeLabel;
      return { message: `Day ${dayNumber ?? '?'} is outside ${range ?? 'the trip’s dates'}. Move the day, or change the trip dates.`, dayNumber };
    }
    if (message.includes('stops are malformed')) return { message: GENERIC, dayNumber, clientBug: true };
    if (message.includes('up to 6 stops')) return { message: 'A day can have up to 6 stops or ride-throughs.', dayNumber };
    if (message.includes('too detailed to save')) {
      return { message: `${dayNumber ? `Day ${dayNumber} is` : 'A day is'} too detailed to save — try shorter place names or fewer stops.`, dayNumber };
    }
    if (message.includes('stable id')) return { message: GENERIC, clientBug: true };
    if (message.includes('share the same id')) return { message: GENERIC, clientBug: true };
    if (message.includes('stop needs a name')) return { message: `One of ${dayNumber ? `day ${dayNumber}'s` : 'a day’s'} stops has no name.`, dayNumber };
    if (message.includes('stop or a ride-through')) return { message: GENERIC, clientBug: true };
    return { message: GENERIC, clientBug: true };
  }
  return { message: 'KSU couldn’t reach the server. Your plan is still here — try Save again.' };
}
