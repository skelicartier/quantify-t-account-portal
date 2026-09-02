# Deployment guide

## Current release boundary

The portal source is suitable for GitHub CI and a Vercel **preview/staging** project. Website signup, trusted PKCE confirmation, non-enumerating recovery/reset, consent metadata, and Supabase-managed Turnstile submission are implemented in source but have not been exercised against an authorized managed project. Recovery reset uses a five-minute HttpOnly browser marker bound to the exchanged UUID/access token and consumes it before mutation; without a separately approved server-held signing secret or atomic nonce store, that marker does not protect against a malicious bearer-token holder or concurrent replay. MFA/admin flows and the dedicated Azure Account API remain future rollout work, and the checked-in Supabase migrations have not run against PostgreSQL or staging.

Vercel builds must never migrate Supabase, seed roles, inspect desktop data, or deploy Azure resources.

## Vercel preview/staging setup

1. Import `aaryansaroha98/quantify-t-account-portal` into a new Vercel project.
2. Select the Next.js framework preset and Node.js 24. Keep the default install command (`npm install`/`npm ci`) and build command (`npm run build`). The repository's `prebuild` gate permits previews but deliberately rejects `VERCEL_ENV=production`.
3. Enable Vercel Deployment Protection before supplying staging credentials, scope every staging value to Preview, and leave Production values unset. Do not attach the production account domain until the production gate below passes and the code lock is removed in the reviewed release task.
4. Configure only these reviewed values in Vercel project settings:

   | Variable                               | Scope                       | Rule                                                                                                                                                                    |
   | -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL`                 | Browser-safe                | Exact staging portal origin, HTTPS outside localhost.                                                                                                                   |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Browser-safe                | Authorized staging Supabase URL, HTTPS.                                                                                                                                 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe                | Publishable/anonymous staging key only.                                                                                                                                 |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | Browser-safe                | Staging site key. The portal submits responses as Supabase Auth `captchaToken`; the private verification secret belongs only in authorized Supabase Auth configuration. |
   | `QT_ACCOUNT_API_URL`                   | Server-side public endpoint | Leave on the documented placeholder/omit from active use until the Task 8 Account API exists. Never place a credential in the URL.                                      |

5. Never configure `SUPABASE_SERVICE_ROLE_KEY`, `AZURE_STORAGE_CONNECTION_STRING`, `BREVO_API_KEY`, `QT_AUTH_RESET_SECRET`, signing private keys, database passwords, or refresh/access tokens in this project.
6. In an authorized, isolated staging Supabase project only, configure the exact site origin and callback URLs produced by the portal: `/auth/confirm?flow=signup` and `/auth/confirm?flow=recovery`. Enable managed Turnstile verification and approved SMTP/templates there. Do not change production Auth settings during preview setup. The current desktop signup expects an immediate Auth session, so mandatory email confirmation must not be enabled on the shared/live project before desktop compatibility is proven.
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

The strict preflight is expected to fail while `productionReady` remains locked, including while any production warning is unresolved. It does not read `.env` files or mutate cloud resources.

## Azure backend boundary

This repository does not contain the dedicated Azure Account API. Do not repurpose or deploy the desktop update Function as the portal administration backend. Account API code, capability-based RBAC, infrastructure, Key Vault references, exact-origin CORS, and staging deployment belong to future Task 8 and require separate review.

No Azure deployment should happen from Vercel, GitHub Actions, or this repository at the current stage.

## User-data safety

- Existing desktop/Supabase user records are read-only during portal preview preparation.
- Never replay the clean-local Supabase baseline over an existing project.
- Never seed Owner/Admin/Support from email, metadata, local SQLite, or desktop flags.
- Any migration application requires a backup, disposable staging clone, schema diff, pgTAP/RLS evidence, and explicit authorization.
- Authenticated smoke tests use disposable staging identities only.

## Rollback and production gate

A Vercel preview can be removed or rolled back to a prior deployment without changing Supabase/Azure data. Vercel production builds are also hard-blocked by `scripts/deployment-gate.ts`; the lock may be removed only in the reviewed release task. Production remains **NO-GO** until all of the following are recorded: successful staging Auth lifecycle evidence, PostgreSQL migration/pgTAP evidence, Azure Account API RBAC parity, backup/restore rehearsal, exact-origin CORS, enforced credential-surface controls, DNS/TLS ownership, secret configuration review, and explicit human approval.
