# Deployment guide

## Current release boundary

The portal source is suitable for GitHub CI and a Vercel **preview/staging** project. Azure Account API-backed login/logout/signup, token email confirmation, non-enumerating recovery/reset, consent metadata, source-locked account security settings, read-only account session/activity views, account data export/deletion controls, source-only Account API contracts, same-origin Server Action provenance checks, private signed artifact-download endpoints, and protected `/admin` dashboard plus `/admin/roles` reconciliation routes are implemented but have not been exercised against an authorized managed project. Session registration/heartbeat/revocation, privileged admin mutations, Account API deployment, desktop one-time handoff migration, and the checked-in legacy Supabase migrations have not run against Azure, PostgreSQL, Storage, or staging.

Vercel builds must never migrate Supabase, seed roles, inspect desktop data, deploy Azure resources, or mutate live provider settings.

## Vercel preview/staging setup

The production portal origin is `https://console.quantifyterminal.com`. Staging and
Preview must use a separate exact HTTPS origin, such as the protected Vercel Preview
URL; do not add the production console origin to staging until the production gate is
approved. Account API CORS must contain only the active exact staging origin during
staging validation and must never use `*`.

1. Import `aaryansaroha98/quantify-t-account-portal` into a new Vercel project.
2. Select the Next.js framework preset and Node.js 24. Keep the default install command (`npm install`/`npm ci`) and build command (`npm run build`). The repository's `prebuild` gate permits previews but deliberately rejects `VERCEL_ENV=production`.
3. Enable Vercel Deployment Protection before supplying staging credentials, scope every staging value to Preview, and leave Production values unset. Do not attach the production account domain until the production gate below passes and the code lock is removed in the reviewed release task.
4. Configure only these reviewed values in Vercel project settings:

   | Variable                         | Scope                       | Rule                                                                                                  |
   | -------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL`           | Browser-safe                | Exact staging portal origin, HTTPS outside localhost.                                                 |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser-safe                | Optional staging site key when challenge enforcement is enabled outside the portal.                   |
   | `QT_ACCOUNT_API_URL`             | Server-side public endpoint | Authorized staging Account API base URL, HTTPS outside localhost, no credentials, query, or fragment. |

5. Never configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AZURE_STORAGE_CONNECTION_STRING`, `BREVO_API_KEY`, `QT_AUTH_RESET_SECRET`, signing private keys, database passwords, or refresh/access tokens in this project.
6. In an authorized isolated staging Account API only, configure the exact site origin and callback URLs produced by the portal: `/auth/confirm?token=...` and `/reset-password?token=...`. Do not change production Auth, Supabase, Azure, Storage, DNS, or provider settings during preview setup.
7. Require the GitHub `Portal CI` workflow to pass before promoting a preview.

## Validation commands

A standalone GitHub checkout uses:

```bash
npm ci
npm run validate:portal
npm run test:e2e
```

The integrated local workspace, where the desktop and marketing repositories are present, additionally uses:

```bash
npm run validate
npm run preflight:strict
```

The strict preflight is expected to fail while `productionReady` remains locked, including while any production warning is unresolved. It does not read `.env` files, touch any Storage service, or mutate cloud resources.

`npm run validate` passes end to end in the integrated workspace and reports 28 pass, 6 warning, 0 blocked with `sourceReady` true. A `preflight:json` failure at the migration-integrity check is therefore never expected: it means the desktop migration bytes drifted from the reviewed pins and a human must review the migration change before repinning.

Pin enforcement runs only where the desktop repository is present. `Portal CI` runs `validate:portal`, which stops at `next build` and never reaches preflight, and the focused real-bytes test skips when the sibling desktop checkout is absent. Treat the integrated `npm run validate` run and code review as the enforcement point for migration drift, not CI.

## Azure backend boundary

This repository does not contain the dedicated Azure Account API package; the source-only package lives in the sibling desktop repository at `cloud/azure/account_function/`. Do not repurpose or deploy the desktop update Function as the portal administration backend. Account API deployment, Key Vault references, exact-origin CORS evidence, user-administration mutation rollout, and staging publication require separate approval and review.

No Azure deployment should happen from Vercel, GitHub Actions, or this repository at the current stage.

## User-data safety

- Existing desktop/Supabase user records are read-only during portal preview preparation and migration rehearsal.
- Never replay the clean-local Supabase baseline over an existing project.
- Never seed Owner/Admin/Support from email, metadata, local SQLite, or desktop flags.
- Any migration application requires a backup, disposable staging clone, schema diff, pgTAP/RLS evidence, and explicit authorization.
- Authenticated smoke tests use disposable staging identities only.
- The portal handles no user images. It never accepts, stores, processes, proxies, or displays a picture, and it performs no Storage access at all, so no deployment step needs bucket configuration, object lifecycle rules, or image-processing capacity.
- `app_profiles.profile_photo_path` stays exactly as the desktop application and its retained v1 RPC left it. The portal never selects, projects, or writes that column, and no deployment step may add a migration, delete a row, or clear a value.
- Session/activity views are read-only in the portal and call Account API `/sessions` and `/activity`; the portal does not connect to Azure SQL or carry database credentials. The sibling Account API now has source-only profile read/update, session register/resume/heartbeat/end/self-revoke/event routes, a bounded aggregate `/admin/metrics` route, Support-redacted `/admin/users` directory/detail routes, notification targeting/admin publish/receipt/state/email-queue/outcome routes plus a disabled email worker contract, Owner-only configuration/credential/release status routes, a bounded `/admin/audit-events/search` audit explorer route, caller-private report queue/download descriptor routes, private signed artifact-download endpoints, disabled report/export artifact workers, disabled deletion cleanup worker, account export/deletion state routes, a profile active-flag `/admin/users/{user_id}/activation` route, and a target session inventory `/admin/users/{user_id}/sessions/{session_id}/revoke` route, and the portal/desktop have best-effort register/heartbeat/end hooks. The desktop Account workspace is labeled System in source while keeping the internal Account identifier for compatibility, desktop profile/preference writes use the versioned profile RPC, desktop cloud-password writes keep only random local lock hashes, and already-running desktop sessions fail closed after Account API revoked-session responses, but the API is not deployed, portal runtime heartbeat evidence is absent, live desktop evidence is absent, desktop one-time handoff is unfinished, paginated/live metrics are unevidenced, role mutation is unfinished, live email delivery/provider evidence is unfinished, credential rotation and release publishing are unfinished, live artifact-generation evidence, export retrieval/decryption UX, provider/Auth tombstone completion, and remote deletion of offline desktop caches remain later staging work.
- The eleven desktop migration files are pinned by exact SHA-256 digests in the portal preflight. Editing a migration without repinning the reviewed digest blocks the source gate instead of silently shipping.

## Rollback and production gate

Final local/source account-architecture slices are complete or near-complete, but this
is not deployment approval. Staging and production remain locked until explicit
authorized staging/cloud evidence covers migrations, provider email, Storage signing,
export retrieval/decryption, provider/Auth tombstone completion, monitoring, backups,
rollback, and final go/no-go.

A Vercel preview can be removed or rolled back to a prior deployment without changing Supabase/Azure data. Vercel production builds are also hard-blocked by `scripts/deployment-gate.ts`; the lock may be removed only in the reviewed release task. Production remains **NO-GO** until all of the following are recorded: successful staging Azure auth lifecycle evidence, migration/pgTAP or Azure SQL parity evidence as applicable, deployed Azure Account API RBAC parity, backup/restore rehearsal, exact-origin CORS, enforced credential-surface controls, DNS/TLS ownership, secret configuration review, and explicit human approval.
