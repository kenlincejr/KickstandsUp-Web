export type PlannerPostPreviewAction = 'review' | 'fuel' | 'conditions' | 'save' | 'handoff';

export function nextPlannerAction(input: { freshPreview: boolean; conditionsChecked: boolean; saved: boolean }) : PlannerPostPreviewAction {
  if (!input.freshPreview) return 'review';
  if (!input.conditionsChecked) return 'conditions';
  if (!input.saved) return 'save';
  return 'handoff';
}

export function scorePlannerPhaseThree(criteria: {
  freshPreviewStatus: boolean;
  actionRail: boolean;
  conditionsSafety: boolean;
  handoffDiagnostics: boolean;
  saveRevisionFeedback: boolean;
  noUnauthorizedShareQr: boolean;
}) {
  const checks: Array<[keyof typeof criteria, number]> = [
    ['freshPreviewStatus', 20], ['actionRail', 20], ['conditionsSafety', 15], ['handoffDiagnostics', 20], ['saveRevisionFeedback', 15], ['noUnauthorizedShareQr', 10],
  ];
  const score = checks.filter(([key]) => criteria[key]).reduce((total, [, value]) => total + value, 0);
  return { score, maxScore: 100 as const, passed: score === 100 };
}
