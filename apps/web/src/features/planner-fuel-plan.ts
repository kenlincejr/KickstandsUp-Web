export type PlannerFuelSource = 'bike_exact' | 'bike_band_estimate' | 'route_override' | 'manual';
export type PlannerFuelPlan = { rangeMiles: number; reservePercent: number; source: PlannerFuelSource; plannerVersion: 1; bikeId?: string; bikeLabel?: string };
export type PlannerGarageBike = { id: string; label: string; fuelRangeBand: 'under_100' | '100_149' | '150_199' | '200_plus' | null; planningRangeMiles: number | null; fuelReservePercent: number | null; isActive: boolean };
export type PhaseTwoScore = { score: number; checks: Record<'garageRpc' | 'honestSource' | 'revisionSnapshot' | 'confirmedFuelStop' | 'noGarageFallback', boolean> };

export function scorePhaseTwo(input: PhaseTwoScore['checks']): PhaseTwoScore {
  const score = Object.values(input).filter(Boolean).length * 20;
  return { score, checks: input };
}

export function suggestedPlannerRange(band: PlannerGarageBike['fuelRangeBand']) {
  return band === 'under_100' ? 80 : band === '100_149' ? 115 : band === '150_199' ? 150 : band === '200_plus' ? 200 : null;
}

export function fuelPlanForBike(bike: PlannerGarageBike, reservePercent = 20): PlannerFuelPlan | null {
  const rangeMiles = bike.planningRangeMiles ?? suggestedPlannerRange(bike.fuelRangeBand);
  return rangeMiles ? { rangeMiles, reservePercent: normalizeReserve(bike.fuelReservePercent ?? reservePercent), source: bike.planningRangeMiles ? 'bike_exact' : 'bike_band_estimate', plannerVersion: 1, bikeId: bike.id, bikeLabel: bike.label } : null;
}

export function manualPlannerFuelPlan(rangeMiles: number, reservePercent: number, source: 'route_override' | 'manual'): PlannerFuelPlan | null {
  if (!Number.isFinite(rangeMiles) || rangeMiles < 40 || rangeMiles > 400) return null;
  return { rangeMiles: Math.round(rangeMiles), reservePercent: normalizeReserve(reservePercent), source, plannerVersion: 1 };
}

export function plannerFuelSourceLabel(source: PlannerFuelSource) {
  return source === 'bike_exact' ? 'Exact range saved for this bike' : source === 'bike_band_estimate' ? 'Conservative estimate from this bike’s fuel-range band' : source === 'route_override' ? 'Route-only range override' : 'Manual fuel plan for this route';
}

function normalizeReserve(value: number) { return Math.max(5, Math.min(50, Math.round(value))); }
