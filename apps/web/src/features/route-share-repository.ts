import { supabase } from '../lib/supabase';

export type RouteShareRecipient = { id: string; displayName: string };
export async function listRouteShareRecipients() {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  const { data, error } = await supabase.rpc('list_my_route_share_recipients');
  if (error) throw new Error('KSU could not load friends for this private share.');
  return (Array.isArray(data) ? data : []).flatMap((row: Record<string, unknown>) => typeof row.id === 'string' && typeof row.display_name === 'string' ? [{ id: row.id, displayName: row.display_name }] : []);
}
export async function shareRouteWithFriends(routeRevisionId: string, recipientIds: string[], allowCopy: boolean) {
  if (!supabase) throw new Error('KSU Cloud is not configured for this website.');
  const { error } = await supabase.rpc('create_route_share_grants', { target_route_revision_id: routeRevisionId, recipient_ids: recipientIds, copy_allowed: allowCopy });
  if (error) throw new Error(error.message || 'KSU could not share this route.');
}
