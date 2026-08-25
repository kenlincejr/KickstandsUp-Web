import { handoffHeaders, renderHandoffPage } from '../../lib/handoff-page.js';

export function onRequestGet(context) {
  const token = context?.params?.token;
  const url = new URL(context.request.url);

  const page = renderHandoffPage({
    route: 'connect',
    token: Array.isArray(token) ? token[0] : token,
    userAgent: context.request.headers.get('user-agent'),
    noApp: url.searchParams.has('noapp'),
    title: 'KSU rider connection',
    eyebrow: 'Kickstands Up',
    heading: 'A rider wants to connect.',
    body: 'Open KSU to send a trusted-rider request.',
    assurance: 'A link only ever sends a request &mdash; the other rider still has to accept it. KSU never shares your location automatically.',
  });

  return new Response(page, { headers: handoffHeaders });
}
