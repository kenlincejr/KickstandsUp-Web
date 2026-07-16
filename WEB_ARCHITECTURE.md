# KSU Web Architecture

Status: foundation implemented locally; not deployed  
Last updated: 2026-07-15

## Executive decision

KSU will use two GitHub repositories with one product backend:

- `KickstandsUp` owns the Expo SDK 57 mobile app, Supabase migrations and tests, Edge Functions, Realtime authorization, and canonical data contracts.
- `KickstandsUp-Web` owns `rideksu.com`, public/deep-link pages, web sign-in UX, the desktop route planner, and Club/MC officer tools.
- Supabase is the identity, authorization, durable-data, and instant-sync authority for both clients.
- Cloudflare Pages serves the website from the GitHub `main` branch and runs narrow request-time Pages Functions. GitHub stores and reviews the source; Cloudflare is the active public delivery layer.
- EAS builds and delivers the native app. It is not a web backend and does not sit between the website and Supabase.

This split protects desktop product quality without duplicating the rules that matter. Web and mobile can have different UI implementations, but they must use the same UUID identity, RPCs, capability projection, route revision, audit events, and Realtime topics.

## Why work should start now

The website is becoming a product surface, not a brochure. Folder boundaries, URL ownership, authentication callbacks, capability checks, route-revision semantics, and Google Maps licensing are expensive to retrofit after Club/MC screens and planner state spread through the codebase.

The first foundation is intentionally non-destructive:

- The currently deployed root `index.html`, invite fallbacks, association files, headers, and Pages Functions remain in place.
- The new application lives under `apps/web` and builds to `dist` only when explicitly invoked.
- No Cloudflare build setting, DNS, Supabase redirect allowlist, hosted migration, Maps key, or production deployment was changed.

## Repository and folder ownership

```text
KickstandsUp/                         # private mobile/backend repository
  src/app/                            # Expo Router screens
  src/features/                       # mobile feature UI and orchestration
  src/lib/                            # mobile service adapters
  supabase/migrations/                # canonical schema, RLS, RPCs, Realtime auth
  supabase/functions/                 # privileged server operations
  supabase/tests/                     # authorization and data-contract proof
  docs/                               # cross-product specs and decisions
  ksu-web/                            # ignored local checkout of KickstandsUp-Web

KickstandsUp-Web/                     # public website repository
  apps/web/                           # React/TypeScript/Vite website
    src/app/                          # routing and application shell only
    src/features/                     # marketing, auth, planner, Club/MC UI
    src/lib/                          # browser-safe Supabase and provider adapters
  packages/contracts/                 # web-side capability and route types
  functions/                          # Cloudflare Pages request-time functions
  .well-known/                        # Android App Links and iOS Universal Links
  invite/, connect/                   # static privacy-safe fallbacks
  _headers, _redirects                # Cloudflare response/routing policy
  dist/                               # generated deployment output; never hand-edited
```

`packages/contracts` is not an independent source of backend truth. Supabase migrations remain canonical. Generated database types and contract fixtures should be refreshed from `KickstandsUp` in CI, then reviewed in the website pull request.

## URL ownership

| URL | Audience | Owner | Rendering and cache policy |
| --- | --- | --- | --- |
| `/` | Anyone | Web | Marketing, static/edge cached |
| `/privacy`, `/terms`, `/support` | Anyone | Web | Static, versioned content |
| `/invite/:token`, `/connect/:token` | Token holder | Web + Edge | Minimal fallback, `no-store`, `no-referrer`, `noindex` |
| `/r/:token` | Token holder | Web + Edge | Future redacted ride projection with request-time metadata |
| `/help/:token` | Token holder | Web + Edge | Redacted Roadside Help preview; `no-store`, `no-referrer`, `noindex`; sign-in/app handoff only |
| `/c/:token` | Anyone or token holder | Web + Edge | Future redacted club storefront projection |
| `/c/join/:token` | Invite holder | Web + Edge | Safe club-invite preview and authenticated accept handoff; never auto-joins |
| `/shop` | Anyone | Web | Public merchandise placeholder; future physical-goods checkout |
| `/pricing` | Anyone | Web | Transparent Participant, Premium, and Club explanation; purchase actions follow platform/context policy |
| `/signin` | Anyone | Web | Starts Supabase PKCE OAuth |
| `/auth/callback` | OAuth redirect | Web | PKCE completion; never CDN cached |
| `/app/*` | Signed-in rider | Web | Client application; RLS remains authoritative |
| `/app/planner` | Premium-capable rider | Web | Desktop planner shell and route revisions |
| `/app/clubs` | Club member/officer | Web | Club home and permission-gated officer tools |
| `/app/clubs/:clubId/billing` | Club billing administrator | Web + Supabase Edge | Organization status, annual Checkout, invoices/portal; server capability required |
| `/.well-known/*` | Operating systems | Web | App association documents with exact content types |

Canonical HTTPS links should open the native app through Universal Links/App Links when installed and fall back to these web routes otherwise. Custom `ksu://` links are secondary and must never be the only OAuth or invite path.

## Authentication

The website and app use the same Supabase Auth user UUID. Email is profile data, not an authorization key.

Web flow:

1. `/signin` calls Supabase Google OAuth with PKCE.
2. Google returns through the configured Supabase callback.
3. Supabase redirects only to an allowlisted exact KSU URL such as `https://rideksu.com/auth/callback`.
4. The browser exchanges the authorization code using the PKCE verifier.
5. The web client uses the public Supabase publishable key and the rider session. It never receives the service-role key.

Required external configuration before sign-in is enabled:

- Add the KSU website origin to the Google Web OAuth client.
- Add exact production and local callback URLs to Supabase Auth redirect allowlists.
- Set Cloudflare Pages public environment values for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Confirm auth callback responses are `no-store` and excluded from broad SPA caching.

Google Sign-In credentials and the Google Maps browser key are different resources and must remain separate.

## Free, Premium, and Club/MC gates

There are three independent questions:

1. Is the rider authenticated?
2. Does the rider have an active account capability such as Premium planning?
3. Does the rider hold a permission in this specific club?

The browser route guard answers only the first question for navigation UX. Supabase must answer all three for every sensitive read or mutation.

- Individual paid access comes from the existing `my_effective_entitlement()` boundary until the broader capability RPC is implemented.
- Free is the conservative default when no active entitlement exists.
- Club seats must not be copied into individual `account_entitlements`.
- Club membership, display title, permission role, ride participation, ride-day role, and live-location consent remain separate facts.
- Sensitive club operations use narrow `SECURITY DEFINER` RPCs with caller checks, bounded input, pinned `search_path`, intentional grants, and audit rows.
- Direct client writes to membership, ownership, waiver verification, billing, or audit tables are prohibited.
- Recent authentication is required for ownership transfer, destructive exports, permission changes, and other high-impact officer actions.

The web contract currently models account tier and club permissions separately. Officer buttons remain disabled until the server-side Club/MC capability projection and migrations are approved and implemented.

The post-trial contract is deliberately rider-safe:

- **Guest Rider Pass:** a redacted shared-ride view, published route/stops, and external navigation handoff. No account is required.
- **Participant Access:** direct/shared/invited ride links, authorized details/RSVP/essential updates, published route/map handoff, My Rides, account continuity, and sponsored Club scope. It has no global Discover, rider connections, Friends, Quick Meetups, Create, general chat, or personal/advanced planning.
- **Premium:** the existing full rider network—Discover, rider connections, Friends, Quick Meetups, Create, chat—plus individual planning/authoring and fair-use provider banks. Apple/Google/KSU grant sources project into the individual entitlement boundary.
- **Club/MC:** a separate organization context using the officer's normal Supabase UUID. Membership, role, organization entitlement, billing capability, and named seat are separate facts. A club contract sponsors only club-scoped member/tools and selected seats; it does not automatically grant global Premium.

**Roadside Help is independent of tier:** every eligible signed-in rider may request or offer non-emergency help. The website exposes only the opaque-token redacted preview and app/sign-in handoff. Exact location, requester identity, note, contact data, offer actions, and authenticated coordination never enter an anonymous web projection. Assistance payment/provider concepts remain separate from Club billing and merchandise.

The browser only gives navigation UX. Every sensitive read and mutation is enforced server-side. If entitlement state is stale or unavailable, already-authorized published-route viewing and handoff remain available, while new paid/provider operations fail closed. No downgrade deletes saved routes or invalidates a coordinator's published ride.

## Club/MC web product layout

The full-fidelity console is a desktop workflow, organized around officer jobs rather than database tables:

- Overview: next event, incomplete assignments, RSVP count, waiver attention, undelivered announcements.
- Calendar: rides, meetings, socials, dealership events, recurrence, and club-ride linkage.
- Roster: membership lifecycle, display titles, narrowly scoped roles, seat assignment, and privacy-safe exports.
- Ride day: lead/sweep request and acceptance, sign-in, attendance, briefing acknowledgement, and after-ride closeout.
- Roadmarks: full builder and review for cooperative Route Rollcall, Checkpoint Run, Miles Together, and Show Up objectives tied to pinned club routes/events. Roadmarks never rank speed; member participation is explicit and club-sponsored while management requires named capability plus an active organization entitlement.
- Waiver status: status and dates only; KSU does not present itself as legal counsel or become an unrestricted legal-document vault.
- Announcements: one authored record plus asynchronous fanout and delivery status.
- Storefront: separately approved public projection; never anonymous base-table reads.
- Audit: bounded officer-visible history for sensitive transitions.

The mobile app remains optimized for ride day, weak signal, sunlight, gloves, and quick confidence. Officers may view or complete urgent actions on mobile, but bulk roster work, calendar planning, exports, and audit review are web-first.

Active server-confirmed membership—not Premium, a pending invite, club-ride participation, or a named seat—is the mobile Clubs-navigation trigger. Invite links require authenticated explicit acceptance. Participant accounts receive the sponsored club home, announcements/calendar, RSVP, published route/map handoff, Roadmarks, and approved member channel while the organization contract permits it. Global Premium remains separate.

The website is the full-fidelity Club Command surface. It owns bulk roster/filtering, full attendance and waiver-status review, recurring-event administration, Roadmarks authoring/review/export, exports, audit history, ownership/closure, Premium-seat pools, storefront publishing, organization billing status, and the desktop club route library/planner. Mobile retains member use, Roadmark participation/progress and safe stopped checkpoint actions, invite acceptance/sharing, basic event/announcement work, urgent single-member actions, leader/sweep response, and offline ride-day sign-in. Both clients call the same protected RPCs and audit boundaries defined in `KickstandsUp/docs/club-membership-navigation-and-surface-spec.md` and `KickstandsUp/docs/club-roadmarks-product-and-architecture-spec.md`.

## Commerce boundary

The website uses Stripe-hosted Checkout/Billing for an approved annual Club Organization contract. Stripe can dynamically present eligible card, Apple Pay, and Google Pay methods; the wallets are payment methods, not KSU entitlement authorities. Individual Premium remains Apple/Google in-app billing, with RevenueCat recommended as the lifecycle adapter and Supabase as KSU's authorization authority.

Club billing flow:

1. An authenticated officer with recent auth and `club.billing.manage` requests an allowlisted annual checkout from a Supabase Edge Function.
2. The Edge Function—not the browser—selects Stripe customer, Product/Price, currency, seat bundle, tax behavior, and exact return URLs.
3. Stripe-hosted Checkout collects payment. KSU never receives raw card data.
4. The success page shows confirmation pending; it does not grant access.
5. A dedicated Supabase Edge webhook verifies the Stripe signature against the raw body, deduplicates the event, and transactionally updates billing evidence plus `club_entitlements`.
6. Website/mobile refetch server capabilities after the club revision/invalidation.
7. A billing-authorized officer uses a short-lived Stripe Customer Portal URL for invoices, payment method, and cancellation.

The mobile app initially contains no Club purchase button, Stripe webview, or price-linked external checkout CTA. Apple/Google policy and legal review are required before presenting a web-sold Club digital entitlement in the store-distributed app. Pilot clubs use audited KSU grants until that gate is resolved.

Physical merchandise may reuse the Stripe account and hosted Checkout but remains a separate system: different Product/Price namespace, one-time payment-mode session creator, order/event/refund tables, tax/shipping address, fulfillment provider, privacy/retention, and support workflow. Merchandise webhooks never write `account_entitlements`, `club_entitlements`, membership, roles, or seats.

The canonical access/payment architecture and phase gates are in `KickstandsUp/docs/KSU_ACCESS_COMMERCE_AND_PHASED_IMPLEMENTATION_SPEC_2026-07-15.md`.

## Route planner and Google Maps boundary

Google provides the map canvas and approved provider services. KSU provides the product identity:

- ordered waypoints;
- start, finish, shaping, must-stop, fuel, food, and regroup semantics;
- immutable route revisions;
- club-library provenance and forks;
- fuel-range and leg compilation;
- leader/sweep readiness;
- route-to-ride publishing;
- mobile handoff and revision freshness.

The visual design should brand the surrounding cockpit—panels, controls, markers, route line, summaries, revision badges, and club context—without obscuring or altering required Google attribution.

Only a dedicated browser key may ship in the bundle. It must be restricted by HTTP referrer to exact KSU domains and restricted to the required Maps APIs. Server-side provider calls use separate server credentials, quotas, rate limits, per-user/per-club ledgers, cost alarms, and kill switches.

The durable KSU route stores provider-neutral user intent: ordered coordinates, permitted place IDs, stop semantics, preferences, and revision identity. Google-generated instructions, durations, and polylines are treated as recomputable provider output unless the applicable agreement explicitly permits retention.

No existing broad Maps key will be copied into this public repository or public build.

## Instant website-to-app updates

“Instant” means convergent and authoritative, not blind client-to-client messaging:

1. Web submits one atomic route or club mutation through an approved RPC.
2. Postgres commits a new entity revision and audit event.
3. Supabase sends a small entity-scoped private Broadcast event such as `{ entityId, revision, changedAt }`.
4. Mobile and web subscribers verify topic authorization and refetch the authoritative projection.
5. Clients ignore stale revisions and show freshness/error state when a refetch fails.

Realtime is an invalidation signal, not the durable record. Cursor movement or collaborative selection can use ephemeral Presence/Broadcast; it should not be written continuously to Postgres. High-frequency live GPS remains ride-scoped, consented, short-lived, and separate from route or club management data.

## Security and privacy baseline

- RLS and RPC authorization protect data; hidden buttons do not.
- No service-role, vendor management, billing, or unrestricted provider key enters the browser bundle.
- Public ride and club pages use narrow redacted projections, token rotation, takedown controls, and bounded caches.
- Roadside Help links use a separate opaque token, immediate terminal/containment revocation, no-store/no-referrer/noindex headers, and no exact location, note, identity, contact, or offer action in anonymous output.
- Invite and OAuth routes use strict referrer and cache policies.
- Content Security Policy must explicitly allow only required Supabase and Google endpoints before Maps is enabled.
- CSV/PDF exports are permission checked, bounded, audited, and not retained in public object storage.
- Operational metrics redact email, precise location, ride notes, message text, tokens, and stable rider identity unless a documented aggregate genuinely requires a bounded dimension.
- Stale or unavailable entitlement, Realtime, map, or monitoring state renders as unknown/unavailable—never silently healthy.

## Cross-repository change contract

Every feature pull request must answer these questions:

- Does it change a table, RPC, RLS policy, Realtime topic, token route, capability, deep link, or route revision?
- Which repository is authoritative for that change?
- Is the change backward compatible with the currently installed native build and currently deployed website?
- Are generated types/fixtures updated in the other repository?
- Do both clients handle the old and new revision during rollout?
- Are Supabase migrations deployed before a client begins calling the new contract?
- Are public URLs, association files, privacy/terms copy, and support instructions still correct?
- Are secrets, cost limits, audit events, and Admin observability included?

Recommended rollout order for additive contracts:

1. Deploy backward-compatible Supabase migration/RPC.
2. Verify authorization tests and hosted contract behavior.
3. Deploy website support while keeping old behavior valid.
4. Release mobile support with the actual EAS delivery contract verified.
5. Remove compatibility fields only after both deployed clients have aged out.

## Implemented foundation

The local website checkout now contains:

- npm workspaces for `apps/web` and `packages/contracts`;
- React 19 + TypeScript + Vite;
- responsive marketing, sign-in, planner, and Club Command shells;
- a PKCE Supabase browser client that fails closed when environment values are absent;
- separate account-tier and club-permission types;
- a fail-closed Premium route gate backed by the existing `my_effective_entitlement()` RPC;
- provider-neutral route revision and waypoint types;
- a planner that clearly separates the KSU cockpit from the future Google canvas;
- deployment output that preserves association files, fallback/legal pages, SPA rewrites, cache controls, and a restrictive pre-Maps Content Security Policy;
- disabled live officer/planner mutations until server authorization and provider configuration exist.

## Remaining approval and execution gates

The next implementation slice should not guess these items:

- Club/MC C1/C2 product gates: member roster visibility, retention, shared-club block behavior, guest RSVP/exact-location rules, 90-day chat approval, and pilot seat count.
- Creation of the Club/MC migrations and `my_effective_capabilities_v1()` RPC.
- A dedicated restricted Google Maps browser key, Map ID/style, quota, and billing alerts.
- Supabase/Google web OAuth callback configuration.
- Cloudflare Pages build command/output change and production deployment.
- Approval and setup of RevenueCat/Apple/Google products for individual Premium.
- Stripe Club test/live account configuration, annual price/seats/grace, Edge secrets, Tax/refund/support ownership, Customer Portal, and legal/platform approval for mobile presentation.
- Merchandise fulfillment/inventory/shipping/returns before enabling the public shop checkout.

Until those gates are approved, the foundation can be built, tested, and reviewed locally without exposing data or incurring map usage.

## Primary platform references

- [Expo Router SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/)
- [Expo Linking SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/linking/)
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Google Maps API security](https://developers.google.com/maps/api-security-best-practices)
- [Google Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
