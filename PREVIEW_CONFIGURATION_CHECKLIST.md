# KSU Website Preview Configuration Checklist

**Prepared:** 2026-07-15  
**Scope:** Cloudflare preview only; no production promotion  
**Source repository:** `kenlincejr/KickstandsUp-Web`

This is the external-action gate for the local React website foundation. Do not enter a credential value in source, Git history, screenshots, tickets, or chat. Record resource names and redacted status only.

## 1. Delivery contract before configuration

- [ ] Review the exact website commit and confirm the feature branch is pushed.
- [ ] Confirm `main` and the current `rideksu.com` production deployment remain unchanged.
- [ ] Re-run `npm run typecheck`, `npm test`, and `npm run build` from the website repository root.
- [ ] Confirm `dist/` contains `_headers`, `_redirects`, legal/support pages, delete-account, invite/connect fallbacks, and both `.well-known` association documents.
- [ ] Scan source and the built bundle for service-role keys, provider secrets, unrestricted Maps keys, tokens, and private identifiers.
- [ ] Record the known-good production Cloudflare deployment ID before any preview setting changes.

## 2. Cloudflare Pages preview

Use a preview branch/deployment. Do not promote it to `rideksu.com` in this gate.

| Setting | Preview value |
| --- | --- |
| Repository | `kenlincejr/KickstandsUp-Web` |
| Root directory | repository root |
| Node | `22.13.1` or the repository's compatible Node 22 runtime |
| Install/build | `npm ci && npm run build` |
| Output directory | `dist` |
| Production branch | Leave the existing `main` mapping unchanged |

- [ ] Capture the assigned preview origin exactly, for example `https://<branch>.<project>.pages.dev`.
- [ ] Confirm preview responses use the built `_headers` and `_redirects` files.
- [ ] Keep auth, invite, and connect routes `no-store`; keep token routes `no-referrer` and `noindex`.

## 3. Supabase public browser environment

Set these for the approved preview environment only:

| Variable | Source | Exposure |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | KSU Supabase project URL | Public endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | KSU publishable/anon browser key | Public constrained key; RLS/RPC remains authoritative |

- [ ] Do not add `SUPABASE_SERVICE_ROLE_KEY` or any server secret to Cloudflare browser variables.
- [ ] Confirm `my_effective_capabilities_v1()` is deployed and tested before the preview consumes it.
- [ ] Add the exact preview callback to Supabase Auth Redirect URLs: `https://<preview-origin>/auth/callback`.
- [ ] Add `http://localhost:4173/auth/callback` only when local OAuth QA is explicitly approved and needed.
- [ ] Leave the production Site URL and production callback policy unchanged during preview setup.

## 4. Google web OAuth

Supabase brokers Google OAuth. The two callback layers are different and must not be swapped.

- [ ] Use the dedicated KSU Google Web OAuth client; do not reuse iOS Maps, Navigation, or server-route credentials.
- [ ] Add the exact preview website origin to the Web client's authorized JavaScript origins: `https://<preview-origin>`.
- [ ] Keep the Google authorized redirect URI pointed at the Supabase Auth provider callback: `https://bwqergdytubvvljguiby.supabase.co/auth/v1/callback`.
- [ ] Put `https://<preview-origin>/auth/callback` in the Supabase Auth redirect allowlist, not in place of the Supabase Google callback.
- [ ] Add `https://rideksu.com` only during a separately approved production-auth change.
- [ ] Verify signed-out `/app/planner?draft=<id>` returns to the same path after Google PKCE sign-in.
- [ ] Verify sign-out, canceled OAuth, account switching, and no cross-account access flash.

## 5. Dedicated Google Maps browser credential — C1 gate

Do not create or enable this credential until the user approves the C1 Maps preview resource and billing action.

| Variable | Requirement |
| --- | --- |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | New browser-only key; exact HTTPS referrers; required browser APIs only |
| `VITE_GOOGLE_MAP_ID` | Approved KSU Web Map ID/style; public identifier |

- [ ] Restrict HTTP referrers to the exact preview origin path, such as `https://<preview-origin>/*`.
- [ ] Do not add broad `*.pages.dev/*`, unrestricted wildcard, iOS bundle, Android package, or server-IP restrictions to this key.
- [ ] Enable only the browser APIs approved for the C1 slice. Maps JavaScript is expected; Places or other APIs require an explicit need and quota.
- [ ] Set API quotas and billing alerts before the first paid browser request. A budget alert does not cap spend.
- [ ] Expand CSP only for the exact Google endpoints required by the implemented map. Preserve attribution.
- [ ] Never copy `GOOGLE_ROUTES_SERVER_API_KEY`, `KSU_GOOGLE_MAPS_IOS_API_KEY`, or `KSU_GOOGLE_NAVIGATION_IOS_API_KEY` into Cloudflare or the web bundle.

## 6. Preview stop test

Public and delivery:

- [ ] `/`, `/shop`, `/privacy`, `/terms`, `/support`, and `/delete-account` render correctly at desktop and mobile widths.
- [ ] `/invite/<opaque-test-token>` and `/connect/<opaque-test-token>` remain privacy-safe and do not expose protected data.
- [ ] `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` return JSON content types.
- [ ] Auth callback, token routes, CSP, referrer, cache, robots, and SPA fallback headers match the contract.

Authentication and access:

- [ ] Signed-out protected routes preserve the complete local path, query, and fragment through PKCE.
- [ ] Participant sees authorized route/handoff value but cannot enter planner authoring by URL or stale cache.
- [ ] Premium can enter planner authoring only with a fresh server `routes.plan` capability.
- [ ] Stale/unavailable projection pauses new paid/provider work and explains that saved/published data is not deleted.
- [ ] Active club navigation appears only from server-confirmed `club.read`; Premium alone does not grant it.
- [ ] Account switching never displays the prior account's capabilities.
- [ ] Private `capabilities:<user-id>` invalidation triggers an authoritative refetch.

Operational evidence:

- [ ] Full Admin shows access contract version, rollout mode, configuration state, projection traffic freshness, aggregate request counts, and revision-row count.
- [ ] Metrics contain no email, stable rider identity, route, location, token, message, or note.
- [ ] Browser console and network failures are reviewed; unavailable data is never rendered healthy.

## 7. Rollback and promotion gate

- [ ] Preview rollback means disabling/deleting only the preview deployment and preview environment mapping; production remains on the known-good deployment.
- [ ] A capability incident rolls clients back to non-consumption/shadow behavior. Do not drop additive A1 tables or remove `my_effective_entitlement()`.
- [ ] Do not promote until the protected planner vertical-slice stop test passes with the restricted browser key and provider-failure fallback.
- [ ] Production promotion requires a separate explicit authorization, reviewed pull request, verified remote `main`, exact Cloudflare mapping, one deployment, route/header smoke tests, and a recorded rollback deployment.

## Redacted resource record

| Resource | Identifier | Preview status |
| --- | --- | --- |
| Cloudflare Pages project | `kickstandsup-web` | Approval required |
| Supabase project | `bwqergdytubvvljguiby` | Active; preview callbacks not configured |
| Google Web OAuth client | Redacted client ID | Preview origin not configured |
| Google Maps browser key | Not created | C1 approval required |
| Google Web Map ID | Not created/approved | C1 approval required |
| Production domain | `rideksu.com` | Unchanged |
