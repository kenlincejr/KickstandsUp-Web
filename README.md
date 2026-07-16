# Kickstands Up website

The source for `rideksu.com`. GitHub owns the repository and review history; the active custom-domain deployment is the Git-connected Cloudflare Pages project `kickstandsup-web`.

## Planned role

- Public HTTPS invite landing pages and redacted ride previews
- App install/fallback guidance
- Marketing and product information
- Supabase-backed rider sign-in and account portal
- Desktop route planner and full-fidelity Club/MC officer tools

The existing root landing page remains the production source until the new React/TypeScript application under `apps/web` is reviewed and the Cloudflare build output is intentionally changed. Authentication, invite-token issuance, capability checks, and privileged mutations remain in Supabase/RLS/Edge boundaries.

## Local foundation

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

See [WEB_ARCHITECTURE.md](WEB_ARCHITECTURE.md) for repository ownership, auth, tier gating, Club/MC permissions, Google Maps boundaries, Realtime sync, URL ownership, and the cross-repository rollout contract.
