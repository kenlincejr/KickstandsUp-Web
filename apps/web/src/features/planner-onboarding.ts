export const plannerGuideStorageKey = 'ksu.route-planner.guide-dismissed.v1';

export const plannerGuideSteps = [
  { title: 'Set your start and finish', detail: 'Search a real place, or choose the exact point and place it on the map.' },
  { title: 'Add only the roads that matter', detail: 'Use Stop here for fuel, food, or regroup. Use Ride through to keep the group on a road you picked.' },
  { title: 'Preview before conditions or handoff', detail: 'Any route change makes the preview stale until you refresh it.' },
] as const;

export function shouldShowPlannerGuide(storageValue: string | null) {
  return storageValue !== 'dismissed';
}

export function scorePlannerPhaseOne(criteria: {
  persistentGuide: boolean;
  helpEntry: boolean;
  actionableChecklist: boolean;
  responsiveBottomSheet: boolean;
  keyboardAndFullscreenRecovery: boolean;
}) {
  const checks: Array<[keyof typeof criteria, number]> = [
    ['persistentGuide', 25], ['helpEntry', 15], ['actionableChecklist', 25], ['responsiveBottomSheet', 20], ['keyboardAndFullscreenRecovery', 15],
  ];
  const score = checks.filter(([key]) => criteria[key]).reduce((total, [, value]) => total + value, 0);
  return { score, maxScore: 100 as const, passed: score === 100 };
}
