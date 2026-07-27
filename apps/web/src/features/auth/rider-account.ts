// Is the signed-in person an EXISTING KSU rider?
//
// Owner policy (2026-07-27): rider accounts are created in the installed app,
// never on the website. rideksu.com signs in riders who already exist; a first
// timer is told to download the app, create the account there, then come back
// with the same login.
//
// Supabase OAuth cannot express "sign in but do not register" — the provider
// round-trip mints the `auth.users` row on first success either way. So the
// website's test for "existing rider" is the thing the APP's onboarding
// creates and the website does not: a `profiles` row for auth.uid(). No row
// means the account has never been through rider setup, so the web sends them
// to the app instead of into /app.
//
// That is deliberately harmless when it happens: the orphaned auth user IS the
// account. Install the app, sign in with the same provider, finish setup, and
// the same login now works on both surfaces — which is exactly the promise the
// sign-in page makes.
//
// LIMIT, stated plainly: this is the client's policy, not the server's
// enforcement. `profiles insert own` (RLS) still lets any authenticated session
// insert its own row, so the boundary is UX-shaped, per the standing rule that
// browser guards are UX and Supabase is the authority. Closing it for real
// needs the KickstandsUp repo to make app onboarding the only sanctioned insert
// path.

import { supabase } from '../../lib/supabase';

export type RiderAccountState =
  /** Auth is not configured in this environment; nothing to check. */
  | { status: 'unconfigured' }
  /** A rider profile exists — this is an existing rider. */
  | { status: 'ready'; displayName: string | null }
  /** Signed in, but rider setup has never been completed in the app. */
  | { status: 'setup-required' }
  /** The check itself failed. NEVER treated as "new rider" — see below. */
  | { status: 'unavailable'; message: string };

type ProfileProbe = {
  data: { id: string; display_name: string | null } | null;
  error: { message: string } | null;
};

/**
 * Maps a `profiles` probe to a rider-account state.
 *
 * A failed probe resolves to `unavailable`, never to `setup-required`. Telling
 * an existing rider on a flaky connection to "go create an account in the app"
 * would be a lie that costs a real sign-in, so the two cases stay distinct: no
 * row is a fact, no answer is not.
 */
export function riderAccountStateFromProbe({ data, error }: ProfileProbe): RiderAccountState {
  if (error) return { status: 'unavailable', message: error.message };
  if (!data) return { status: 'setup-required' };
  return { status: 'ready', displayName: data.display_name };
}

/** Reads the signed-in rider's own profile row. RLS scopes this to auth.uid(). */
export async function fetchRiderAccountState(userId: string): Promise<RiderAccountState> {
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle();
  return riderAccountStateFromProbe({ data: data ?? null, error: error ? { message: error.message } : null });
}
