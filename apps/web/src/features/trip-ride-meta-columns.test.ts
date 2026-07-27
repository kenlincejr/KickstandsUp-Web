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

function bodyOf(fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  expect(start, `${fnName} not found — was it renamed?`).toBeGreaterThan(-1);
  return source.slice(start, start + 1600);
}

describe('getTripRideMeta read path', () => {
  it('never names the phantom staging lat/lng columns in any PostgREST select', () => {
    // The whole-file scan is deliberate: the bug is just as fatal in a sibling
    // reader (listMyTrips, a future trip card) as it was here.
    expect(source).not.toMatch(/select\('[^']*staging_latitude/);
    expect(source).not.toMatch(/select\('[^']*staging_longitude/);
  });

  it('reads through the RPC, not a rides table select', () => {
    const body = bodyOf('getTripRideMeta');
    expect(body).toMatch(/\.rpc\('get_trip_ride_meta'/);
    // A geography column has no useful PostgREST projection, so a table select
    // here can never return the coordinates Autopilot's day 1 needs.
    expect(body).not.toMatch(/\.from\('rides'\)/);
  });

  it('passes the ride id under the parameter name the function declares', () => {
    // A mismatched argument name is a PGRST202 at runtime and nothing at build
    // time; the SQL signature is get_trip_ride_meta(target_ride_id uuid).
    expect(bodyOf('getTripRideMeta')).toMatch(/target_ride_id:/);
  });

  it('reports an unreadable row instead of collapsing it into null', () => {
    // A bare `return null` is what let "the read failed" render as "you are not
    // the coordinator". The result must stay discriminated.
    expect(source).toMatch(/state: 'unreadable'/);
    expect(source).toMatch(/state: 'loaded'/);
  });
});
