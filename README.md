# Kickstands Up website

Static public website for Kickstands Up. The first deployment is intentionally a simple GitHub Pages landing page.

## Planned role

- Public HTTPS invite landing pages and redacted ride previews
- App install/fallback guidance
- Marketing and product information
- Later, a Supabase-backed rider account portal and desktop ride-builder UI

GitHub Pages serves the static frontend only. Authentication, invite-token issuance, and all privileged ride operations remain in Supabase and its Edge Functions.
