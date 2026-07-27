// What the trip-create form still needs before it can be created.
//
// The planner already shows a live readiness checklist per route point
// (`preview-readiness` in route-leg-editor.tsx) instead of failing on submit;
// this is the same idea for trip creation. The rider should be able to see what
// is missing while filling the form, not discover it from an error after
// pressing Create.
//
// Pure so the copy can be pinned by a test — these strings are the entire
// explanation for why the primary action is disabled, so they must stay honest
// and must match what `create()` actually enforces.

export type TripCreateStep = {
  id: 'staging' | 'dates' | 'name';
  /** Section label, matching the RibbonRule the rider sees. */
  label: string;
  done: boolean;
  /** Shown only while incomplete. Says what to do, not what went wrong. */
  todo: string;
};

export type TripCreateReadinessInput = {
  hasStaging: boolean;
  startIso: string | null;
  endIso: string | null;
  /** Mirrors the page's own `datesValid`: end after start, within 30 days. */
  datesValid: boolean;
  title: string;
};

export function tripCreateSteps({ hasStaging, startIso, endIso, datesValid, title }: TripCreateReadinessInput): TripCreateStep[] {
  const bothDates = Boolean(startIso && endIso);
  return [
    {
      id: 'staging',
      label: 'Where it starts',
      done: hasStaging,
      todo: 'Search the meet-up spot or drop a pin on the map.',
    },
    {
      id: 'dates',
      label: 'When',
      done: bothDates && datesValid,
      // A bad range and a missing one are different problems and get different
      // instructions; "pick dates" is useless to someone who already picked two.
      todo: !bothDates
        ? 'Pick when you roll out and when you’re back.'
        : 'End after the start, within 30 days.',
    },
    {
      id: 'name',
      label: 'Name it',
      done: Boolean(title.trim()),
      todo: 'Give the trip a name riders will recognize.',
    },
  ];
}

/** Every step done — the same condition `create()` enforces. */
export function tripCreateReady(steps: readonly TripCreateStep[]): boolean {
  return steps.every((step) => step.done);
}
