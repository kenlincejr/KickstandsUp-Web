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
    body: 'Open KSU to accept — one tap connects you.',
    assurance: 'Opening a link never shares your location. You decide whether to connect, and you can remove a rider at any time.',
  });

  return new Response(page, { headers: handoffHeaders });
}
