# KSU Web (rideksu.com) — Cloudflare Pages SPA. PUBLIC repo.

npm workspaces: `apps/web` (Vite + React 19 + react-router 7 + supabase-js), `packages/contracts`.
Root `functions/` = Pages Functions (place-search / route-preview / route-weather proxies, connect/invite fallbacks).

Commands (repo root): `npm run dev` / `build` (tsc + vite) / `typecheck` / `test` (vitest).

## Invariants

- PUBLIC repo: never commit service-role keys, vendor tokens, or unrestricted Maps keys. Browser Maps key must be referrer-restricted.
- Route guards are UX only — enforcement is Supabase RLS/RPC, owned by the KickstandsUp repo.
- Authorize by Supabase UUID, never email/provider-ID/UI tier label. Premium ≠ club role.
- Public pages use redacted projections or opaque tokens, never anonymous base-table queries.
- Shared contract changes: backend → web → installed app.
- Pushing `main` auto-deploys via Cloudflare Pages: no pushes to `main`, Pages/DNS changes, OAuth redirect edits, or key rotation without explicit owner approval. Work lands on `claude/*` or `codex/*` branches.
- Read `WEB_ARCHITECTURE.md` before architecture, auth, tier gating, Club/MC, Maps, or cross-client Realtime work.
