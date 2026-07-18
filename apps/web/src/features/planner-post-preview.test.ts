import { describe, expect, it } from 'vitest';
import { nextPlannerAction, scorePlannerPhaseThree } from './planner-post-preview';

describe('post-preview route actions', () => {
  it('keeps the rider on the next unfinished job', () => {
    expect(nextPlannerAction({ freshPreview: false, conditionsChecked: false, saved: false })).toBe('review');
    expect(nextPlannerAction({ freshPreview: true, conditionsChecked: false, saved: false })).toBe('conditions');
    expect(nextPlannerAction({ freshPreview: true, conditionsChecked: true, saved: false })).toBe('save');
    expect(nextPlannerAction({ freshPreview: true, conditionsChecked: true, saved: true })).toBe('handoff');
  });

  it('gives the complete Phase 3 delivery 100 points', () => {
    expect(scorePlannerPhaseThree({ freshPreviewStatus: true, actionRail: true, conditionsSafety: true, handoffDiagnostics: true, saveRevisionFeedback: true, noUnauthorizedShareQr: true })).toEqual({ score: 100, maxScore: 100, passed: true });
  });
});
