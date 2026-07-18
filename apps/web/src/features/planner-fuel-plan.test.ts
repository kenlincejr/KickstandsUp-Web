import { describe, expect, it } from 'vitest';
import { fuelPlanForBike, manualPlannerFuelPlan, plannerFuelSourceLabel, scorePhaseTwo } from './planner-fuel-plan';

describe('planner fuel plan', () => {
  it('uses a conservative garage band and stores a private snapshot label', () => {
    expect(fuelPlanForBike({ id: 'bike', label: 'My bike', fuelRangeBand: '100_149', planningRangeMiles: null, fuelReservePercent: null, isActive: true })).toEqual(expect.objectContaining({ rangeMiles: 115, source: 'bike_band_estimate', bikeId: 'bike' }));
  });
  it('keeps a route override separate from the bike', () => {
    expect(manualPlannerFuelPlan(175, 20, 'route_override')).toEqual(expect.objectContaining({ source: 'route_override' }));
    expect(plannerFuelSourceLabel('route_override')).toContain('Route-only');
  });
  it('prefers an owner-saved exact value over the conservative band', () => {
    expect(fuelPlanForBike({ id: 'bike', label: 'My bike', fuelRangeBand: '100_149', planningRangeMiles: 182, fuelReservePercent: 18, isActive: true })).toEqual(expect.objectContaining({ rangeMiles: 182, reservePercent: 18, source: 'bike_exact' }));
  });
  it('scores every Phase 2 rider-safety criterion', () => {
    expect(scorePhaseTwo({ garageRpc: true, honestSource: true, revisionSnapshot: true, confirmedFuelStop: true, noGarageFallback: true }).score).toBe(100);
  });
});
