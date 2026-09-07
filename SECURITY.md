# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting/security-advisory flow for this repository. Do not open a public issue containing credentials, tokens, personal data, account identifiers, or exploitable details.

If a credential is exposed, revoke or rotate it at the provider immediately before relying on a code change. Never commit replacement secrets.

## Data and credential boundary

This repository may contain browser-safe site URLs, a Supabase publishable key, and public API endpoints. It must never contain Supabase service-role keys, Azure storage credentials, email-provider keys, signing private keys, database passwords, bearer/refresh tokens, real `.env` files, authenticated browser storage state, user exports, backups, or production snapshots.

Security testing must use explicitly authorized disposable staging identities. Do not test authentication lifecycle, migrations, role changes, deletion, or revocation against production users.

## Deployment status

The project is pre-production. Production remains blocked until the documented staging and explicit go/no-go gates pass. The Azure Account API source is in the sibling desktop repository and is not deployed; the protected `/admin` dashboard, `/admin/roles` reconciliation page, read-only account session/activity views, account data export/deletion controls, private signed artifact-download endpoints, same-origin Server Action guard, best-effort portal session register/end hooks, and desktop session/passcode migration hooks are source-only, and privileged web administration is not production-ready.
