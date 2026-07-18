import { supabase } from '../lib/supabase';
import type { PlannerGarageBike } from './planner-fuel-plan';

export async function listPlannerGarage(signal?: AbortSignal): Promise<PlannerGarageBike[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_my_garage_v2', { include_archived: false });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error) throw new Error('KSU could not load your garage for fuel planning.');
  return (Array.isArray(data) ? data : []).flatMap((row: Record<string, unknown>) => {
    const id = typeof row.id === 'string' ? row.id : null;
    const make = typeof row.make === 'string' ? row.make : '';
    const model = typeof row.model === 'string' ? row.model : '';
    const nickname = typeof row.nickname === 'string' ? row.nickname.trim() : '';
    const band = row.fuel_range_band;
    if (!id || !make || !model || !['under_100', '100_149', '150_199', '200_plus', null].includes(band as never)) return [];
    return [{ id, label: nickname || `${typeof row.year === 'number' ? `${row.year} ` : ''}${make} ${model}`, fuelRangeBand: band as PlannerGarageBike['fuelRangeBand'], planningRangeMiles: typeof row.planning_range_miles === 'number' ? row.planning_range_miles : null, fuelReservePercent: typeof row.fuel_reserve_percent === 'number' ? row.fuel_reserve_percent : null, isActive: row.is_active === true }];
  });
}
