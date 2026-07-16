# KSU Website Engineering Instructions

Read `WEB_ARCHITECTURE.md` before architecture, auth, tier gating, Club/MC, Google Maps, deep-link, or Realtime work.

The KSU product uses two GitHub repositories with one backend contract:

- This repository owns `rideksu.com`, public/deep-link pages, web auth UX, the desktop route planner, Club/MC officer UI, and Cloudflare Pages configuration.
- The private `KickstandsUp` repository (normally available at `C:\KickstandsUp` when working locally) owns the Expo SDK 57 app, Supabase migrations/tests, RLS, RPCs, Edge Functions, Realtime authorization, and canonical data semantics.

For a user request that changes both app and website behavior, inspect and update both repositories continuously. Keep Git status, diffs, checks, commits, pushes, and deployment reporting separate.

Security rules:

- Browser route guards are UX only. Enforce reads and mutations with Supabase RLS and narrow RPC/Edge boundaries.
- Never place a service-role key, vendor management token, unrestricted Maps key, store credential, or other secret in this public repository or browser bundle.
- Use Supabase UUID identity. Do not authorize by email, OAuth provider ID, UI tier label, or client-authored club role.
- Keep individual Premium access separate from per-club membership, seats, display titles, and permissions.
- Public ride/club pages use redacted projections or opaque token boundaries, not anonymous base-table queries.
- Realtime events invalidate an authoritative entity revision; they do not replace durable Postgres state.
- Only use a dedicated Google Maps browser key restricted to exact KSU HTTPS referrers and required APIs. Preserve Google attribution.

Delivery rules:

- Do not deploy, push, change Cloudflare Pages/DNS, configure OAuth redirects, create/rotate provider keys, or create paid resources unless the user explicitly asks.
- Preserve the live landing page and deep-link fallbacks until the replacement build has passed type-check, tests, production build, responsive browser QA, headers/redirects review, and association-file verification.
- For shared contract changes, roll out additively: backend contract first, website support second, installed-app support third, removal only after both deployed clients have aged out.
