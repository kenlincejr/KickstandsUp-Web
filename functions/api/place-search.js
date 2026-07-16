const SUPABASE_URL = 'https://bwqergdytubvvljguiby.supabase.co';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const authorization = context.request.headers.get('authorization');
  const apiKey = context.request.headers.get('apikey');
  if (!authorization || !apiKey) return Response.json({ error: 'Sign in to use the route planner.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const body = await context.request.text();
  if (new TextEncoder().encode(body).byteLength > 32768) return Response.json({ error: 'Route request is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  const upstream = await fetch(SUPABASE_URL + '/functions/v1/place-search', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      'Content-Type': 'application/json',
      'x-ksu-platform': 'web',
    },
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}
