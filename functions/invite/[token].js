import { handoffHeaders, renderHandoffPage } from '../../lib/handoff-page.js';

export function onRequestGet(context) {
  const token = context?.params?.token;
  const url = new URL(context.request.url);

  const page = renderHandoffPage({
    route: 'invite',
    token: Array.isArray(token) ? token[0] : token,
    userAgent: context.request.headers.get('user-agent'),
    noApp: url.searchParams.has('noapp'),
    title: 'KSU ride invite',
    eyebrow: 'Kickstands Up',
    heading: 'You&rsquo;ve been invited to a KSU ride.',
    body: 'Open KSU to view the protected invite and choose whether to join.',
    assurance: 'KSU never joins a ride automatically from a link.',
  });

  return new Response(page, { headers: handoffHeaders });
}
