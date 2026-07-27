import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source guard for getTripRideMeta's column list.
 *
 * The trip editor shipped telling the trip's OWN creator "only the rider who
 * created this trip can change it", and Autopilot never mounted, because the
 * select named `staging_latitude,staging_longitude`. Those are not columns:
 * `public.rides` stores the pin as `staging_point extensions.geography(Point,
 * 4326)` and every `staging_latitude` in the migration tree is an RPC
 * *parameter* fed to st_makepoint. PostgREST failed the row with 42703 and the
 * old `return null` turned that into a false claim about the rider.
 *
 * This is a source scan rather than a client mock on purpose: the bug was a
 * string in a `.select()`, not logic, so a behavioural test with a stubbed
 * client would have passed while the real query 42703'd. The suite has no
 * jsdom and no Supabase double — scanning the text is what actually catches it.
 */

const source = readFileSync(new URL('./trip-repository.ts', import.meta.url), 'utf8');

/** Columns that genuinely exist on public.rides and that this read needs. */
const ALLOWED = ['id', 'title', 'status', 'staging_display_name', 'created_by'];

function selectListFor(fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  expect(start, `${fnName} not found — was it renamed?`).toBeGreaterThan(-1);
  const body = source.slice(start, start + 1200);
  const match = body.match(/\.select\('([^']+)'\)/);
  expect(match, `${fnName} has no .select('…') to check`).not.toBeNull();
  return match![1];
}

describe('getTripRideMeta column list', () => {
  it('never selects the phantom staging lat/lng columns', () => {
    expect(source).not.toMatch(/select\('[^']*staging_latitude/);
    expect(source).not.toMatch(/select\('[^']*staging_longitude/);
  });

  it('selects only columns that exist on public.rides', () => {
    const columns = selectListFor('getTripRideMeta').split(',').map((column) => column.trim());
    expect(columns).not.toHaveLength(0);
    for (const column of columns) expect(ALLOWED).toContain(column);
  });

  it('keeps created_by, without which the coordinator check silently fails closed', () => {
    expect(selectListFor('getTripRideMeta').split(',')).toContain('created_by');
  });

  it('reports an unreadable row instead of collapsing it into null', () => {
    // A bare `return null` is what let "the read failed" render as "you are not
    // the coordinator". The result must stay discriminated.
    expect(source).toMatch(/state: 'unreadable'/);
    expect(source).toMatch(/state: 'loaded'/);
  });
});
