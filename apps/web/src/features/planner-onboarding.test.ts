import { describe, expect, it } from 'vitest';
import { plannerGuideSteps, scorePlannerPhaseOne, shouldShowPlannerGuide } from './planner-onboarding';

describe('planner onboarding', () => {
  it('keeps the guide available until this device dismisses it', () => {
    expect(shouldShowPlannerGuide(null)).toBe(true);
    expect(shouldShowPlannerGuide('dismissed')).toBe(false);
  });

  it('teaches the safe planning sequence without a modal', () => {
    expect(plannerGuideSteps.map((step) => step.title)).toEqual([
      'Set your start and finish', 'Add only the roads that matter', 'Preview before conditions or handoff',
    ]);
  });

  it('scores the complete Phase 1 experience at 100 points', () => {
    expect(scorePlannerPhaseOne({ persistentGuide: true, helpEntry: true, actionableChecklist: true, responsiveBottomSheet: true, keyboardAndFullscreenRecovery: true })).toEqual({ score: 100, maxScore: 100, passed: true });
  });
});
