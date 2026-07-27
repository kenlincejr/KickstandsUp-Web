/**
 * Byte-parity port of C:\KickstandsUp\src\features\rides\trip-autopilot-reasons.ts
 * (device repo, KickstandsUp). Ported verbatim for trip-autopilot-spec-2026-07-26
 * §6.1 (web surface). No behavior changes — this file is pure copy, no imports,
 * and must stay byte-identical to the device source unless that source changes
 * first.
 *
 * The §4.10 reason grammar and §4.11 trade grammar. Split from trip-autopilot.ts
 * because these are copy — they change independently of the arithmetic — and
 * because the "no bed claims" rule (§3.2d, P-8) wants one surface to scan.
 *
 * HONESTY RULES (test-enforced, P-8):
 * 1. No string built here may contain "bed"/"beds"/"hotel"/"motel"/
 *    "lodging available"/"vacancy"/"has rooms". Autopilot proposes a day
 *    break at a named place; it never claims the place has a room free.
 * 2. Distances are whole miles.
 * 3. F11 (gate round-1, doc-honesty correction): arrival times render via
 *    `toLocaleTimeString` on the absolute instant, but this v1 has NO
 *    lat/lon → IANA-timezone lookup anywhere in the tree, so `localClock`
 *    below renders in the RUNTIME's own local timezone, not the arrival
 *    COORDINATE's true local timezone. That is a real, undone piece of work,
 *    not a rounding error — a rider who has crossed timezones mid-route will
 *    see a clock time off by the zone difference. On-device this still
 *    approximates the rider's own likely current zone far better than a
 *    fixed offset would (motorcycle trips rarely cross more than one or two
 *    zones from home), so the runtime-local rendering stays as the v1
 *    trade-off; this note replaces an earlier, overstated claim that this
 *    rule was fully satisfied. Filed as follow-up work, not silently assumed.
 * 4. `profile.interpolated` prefixes every time clause with "about".
 * 5. A reason never asserts anything about an unnamed place.
 *
 * The ONE place "lodging" is permitted at all is `findLodgingCta` below — a
 * rider-facing CTA VERB ("Find lodging near X"), not a claim about the place.
 */

export type JustificationInput =
  | { kind: 'spacing'; nextFurtherMiles: number }
  | { kind: 'daylight'; minutesBeforeSunset: number; sunsetLocal: string }
  | { kind: 'budget'; saddleLabel: string }
  | { kind: 'fuel'; gapMiles: number }
  | { kind: 'terminus' }
  | { kind: 'rest'; anchorName: string }
  | { kind: 'shape'; frontLoaded: boolean | null };

export type ReasonInput = {
  /** The candidate's resolved name, or null when both free sources failed. */
  anchorName: string | null;
  /** Whole miles driven this day. */
  milesThisDay: number;
  /** Exactly one justification clause, or null when the caller has nothing to add. */
  justification: JustificationInput | null;
  /** §4.10 rule 4 — the profile's duration is a fallback apportionment. */
  interpolated: boolean;
  /** Whole miles from the route origin — the unnamed-break fallback (§3.2b). */
  fallbackMileMarker: number;
};

function localClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function maybeAbout(interpolated: boolean, text: string): string {
  return interpolated ? `about ${text}` : text;
}

function justificationClause(justification: JustificationInput, interpolated: boolean): string {
  switch (justification.kind) {
    case 'spacing':
      return `and the next named town on the route is ${justification.nextFurtherMiles} mi further`;
    case 'daylight': {
      const before = maybeAbout(interpolated, `${justification.minutesBeforeSunset} min`);
      return `stopping here gets you in ${before} before sunset (${localClock(justification.sunsetLocal)})`;
    }
    case 'budget':
      return `closest break to your ${justification.saddleLabel} day`;
    case 'fuel':
      // Describes the day's own longest stretch between named places — that is
      // what dayCost actually measured (F2). Never claim anything about the
      // road PAST this break; that gap was not computed.
      return `this day's longest stretch between named places is ${justification.gapMiles} mi`;
    case 'terminus':
      return 'your destination';
    case 'rest':
      return `no riding — a day in ${justification.anchorName}`;
    case 'shape':
      if (justification.frontLoaded === true) return 'front-loads the miles';
      if (justification.frontLoaded === false) return 'keeps the later days lighter';
      return 'keeps the days even';
  }
}

/**
 * `anchor — distance mi[, justification]` (§4.10). A rest day has no distance
 * clause — its whole sentence is the anchor and the `rest` justification.
 */
export function buildReason(input: ReasonInput): string {
  const anchor = input.anchorName ?? `Mile ${input.fallbackMileMarker}`;

  if (input.justification?.kind === 'rest') {
    return `${anchor} — ${justificationClause(input.justification, input.interpolated)}.`;
  }

  const distance = `${input.milesThisDay} mi`;
  const clause = input.justification ? `, ${justificationClause(input.justification, input.interpolated)}` : '';
  return `${anchor} — ${distance}${clause}.`;
}

export type TradeInput = {
  /** 1-based day number, as shown to the rider ("Day 3"). */
  dayIndex1Based: number;
  dial: 'saddle' | 'dark' | 'shape' | 'fuel' | 'returnBy';
  /** The violation half — no trailing period, no "Day n" prefix. */
  violation: string;
  /**
   * F12 (gate round-1, doc-honesty): §4.11 specifies this as the REAL
   * runner-up plan's cost (re-run the DP with this day's transition
   * forbidden, describe the actual consequence). trip-autopilot.ts's callers
   * do NOT do that re-run today — this is illustrative, plausible-shaped
   * canned copy describing the KIND of trade-off the dial implies, not a
   * value computed from an actual alternative plan. Real runner-up
   * derivation is future work (§4.11's `dp` retains every `k`, so it is
   * possible), tracked rather than silently claimed as done. No leading "the
   * alternative", no trailing period.
   */
  consequence: string;
};

/** `Day <n> <violation> — the alternative <consequence>.` (§4.11) — mandatory both halves. */
export function buildTrade(input: TradeInput): string {
  return `Day ${input.dayIndex1Based} ${input.violation} — the alternative ${input.consequence}.`;
}

/**
 * The single permitted use of the word "lodging" in the whole Autopilot
 * surface — a rider-initiated CTA verb, never a claim about the place
 * (§3.2c). Everything after "near" is the place name Autopilot already
 * resolved for free; the paid Places lookup happens only if the rider taps.
 */
export function findLodgingCta(placeName: string): string {
  return `Find lodging near ${placeName}`;
}
