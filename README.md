# Quantify Terminal Account Portal

Secure, web-only account surface for Quantify Terminal.

Current progress and next tasks: [Account Work Log](docs/ACCOUNT_WORK_LOG.md). Azure Account API-backed auth, notification/email, audit/report, Owner-status, account data export/deletion, same-origin Server Action guard coverage, private signed artifact-download endpoints, and disabled-by-default report/export/deletion cleanup workers are implemented in source only; staging and production remain locked.

## Current rollout status

The repository currently includes the Next.js foundation, enforced security headers, read-only integrated preflight, Azure Account API-backed login/logout/signup, token email confirmation, non-enumerating password recovery/reset, explicit legal-consent metadata, protected account/admin routing, profile/preferences editing through Azure SQL optimistic updates, security settings with source-locked TOTP/email-change controls, source-only `/account/sessions`, `/account/activity`, and `/account/data` views, a UUID-scoped server DAL, allow-listed account DTOs, source-only role-aware `/admin` dashboard plus `/admin/roles` reconciliation, `/admin/audit` exploration, `/admin/reports`, `/admin/notifications`, `/admin/email`, Owner-only status pages, and `/admin/users` directory/detail/activation/session-revoke slices. The sibling Account API has matching source-only Azure auth, session, notification, report, owner-status, and account lifecycle routes. The ordered legacy Supabase identity/RBAC/session migrations live in the desktop repository and have **not** been applied to any cloud project.

Task 8 is complete in source only and independently approved; Task 9 now has source-only admin shell, capability-gated dashboard, privileged AAL2 gates, and read-only role reconciliation work in progress. Task 10 has read-only self session/activity views in the portal, best-effort portal register/heartbeat/end hooks, source-only Account API register/resume/heartbeat/end/self-revoke/event routes, and desktop source hooks for register/heartbeat/end. Task 11 has begun source-only by moving desktop app passcode verifiers to local SecureStore, blocking Supabase passcode metadata trust/writes, opening visible desktop signup/recovery and Manage Account Online links in the account portal, mapping local users by immutable Supabase UUID before email, labeling the desktop Account workspace as System while preserving internal identifiers, migrating desktop profile/preference writes to the versioned profile RPC, replacing local cloud-password verifiers with random lock hashes, failing closed for already-running desktop sessions after Account API revoked-session responses, and showing a once-per-launch local passcode recommendation. Task 12 has begun source-only with a bounded aggregate `/admin/metrics` Account API route and dashboard summary. Task 13 has begun source-only with `/admin/users` and `/admin/users/[userId]` portal pages plus Support-redacted projections, capability-gated profile activation, and target session inventory revoke backed by minimized Account API routes. Task 14 has begun source-only with Account API notification targeting/admin publish/receipt contracts, email queue/outcome routes, and a disabled worker contract, but not provider email delivery. Task 15 has begun source-only with Owner-only configuration, credential, and release status surfaces. Task 16 has begun source-only with bounded `/admin/audit` exploration, caller-private report queue/download descriptors, tested formula-safe CSV projection, endpoint-only private signed downloads, and a disabled report artifact worker. Task 17 has begun source-only with `/account/data` and Account API export/deletion state machines requiring reauthentication, typed confirmations, expected revisions, idempotency, 14-day cooling-off, cancellation, legal-hold blockers, cleanup step state, encrypted export descriptors, endpoint-only private signed downloads, a disabled encrypted export artifact worker, and a disabled deletion cleanup worker that revokes Account API sessions and deletes exact private export artifacts before source-locking provider/Auth tombstone completion. Task 18 has begun source-only with a shared same-origin guard pinned by preflight across all reviewed mutating portal Server Actions. Provider-level revocation/deletion completion, portal runtime heartbeat evidence, desktop one-time handoff, retention jobs, paginated/live metric evidence, role mutation, live artifact-generation evidence, live email delivery, credential rotation, release publishing, and staging evidence remain later work. Managed email delivery, redirect allow-lists, CAPTCHA enforcement, provisioning, MFA provider behavior, Azure deployment, Storage signing behavior, and same-account portal/desktop behavior remain unverified staging evidence. The dedicated Account API source lives in the sibling desktop repository at `cloud/azure/account_function/`; it is not deployed, and this repository must not be treated as a completed production administration backend.

## Safety boundary

- Azure Account API auth is the portal identity authority in source; account joins use immutable account UUIDs returned by that API.
- The portal uses only `QT_ACCOUNT_API_URL`, `NEXT_PUBLIC_SITE_URL`, optional Turnstile site-key configuration, and server-managed HttpOnly cookies.
- Supabase public keys, service-role keys, Azure storage, email-provider, signing, database, and deployment credentials must never enter this repository or Vercel runtime.
- The desktop PIN is device-local and is not part of any portal DTO, query, field, log, or analytics event.
- No build, test, preflight, or deployment command in this repository applies database migrations or reads desktop user records.
- Privileged and cross-user operations go through the dedicated Azure Account API only after its staging deployment and route-specific rollout are approved.

## Account authentication

- `/login`, `/signup`, and `/forgot-password` submit through Server Actions; passwords, challenge responses, provider details, and tokens never enter returned page state or URLs.
- Login and signup call only the server-side Azure Account API client. Signup/recovery return generic accepted responses for new, existing, known, and unknown addresses.
- Signup and recovery build fixed portal links for Azure token confirmation/reset; arbitrary `next` destinations are ignored.
- Required Terms/Privacy acceptance is captured with server-owned version, source, and timestamp metadata. This source metadata is not claimed to be an immutable legal receipt.
- `/auth/confirm` accepts one bounded Azure confirmation token and redirects only to login notices. Password reset accepts one bounded Azure reset token and clears the browser recovery marker after a successful update.
- `/account`, `/account/sessions`, `/account/activity`, `/account/data`, and `/admin` routes are protected by the Next.js proxy and independently revalidated in server-only DAL/API guards.
- The overview reads named `app_profiles` columns under the verified Azure account UUID and maps them to an allow-listed DTO.
- Session and activity pages read explicit owner-scoped column allow-lists from `account_sessions` and `auth_events`; they do not select or render provider session IDs, metadata, network addresses, user-agent strings, tokens, or PIN/passcode fields.
- Web sign-out ends the current Account API session best-effort, asks Azure auth to revoke the refresh session, and always clears this portal's cookie family.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local development.
- Credential and callback routes are private/no-store, and the enforced CSP permits only the reviewed Cloudflare challenge and Azure endpoint classes.

Legacy desktop/Supabase data remains migration context only. Do not mutate live Supabase, Azure, Vercel, Auth, Storage, DNS, or provider settings until authorized staging evidence and the production go/no-go exist.

## Validation

For a standalone clone (including GitHub Actions), run:

```bash
npm ci
npm run validate:portal
npm run test:e2e
```

`validate:portal` generates Next.js route types, then checks formatting, lint, TypeScript, all unit tests, and a production build. E2E tests are credential-free routing/accessibility checks with synthetic configuration.

The integrated workspace additionally contains the desktop and marketing repositories. From that workspace, run:

```bash
npm run validate
```

This adds the offline cross-repository preflight. It reads only explicit checked-in paths and process-environment presence; it never opens real `.env` files or contacts cloud services. Current source preflight reports 28 pass, 6 warnings, 0 blocked; `stagingReady=false` and `productionReady=false` remain intentional. `npm run preflight:strict` remains nonzero while `productionReady` is locked, including while any warning remains.

A real authenticated login/refresh/logout and `/account` accessibility pass requires an explicitly authorized disposable staging account. Never run lifecycle or migration tests against production users.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the protected Vercel preview/staging procedure, environment allow-list, rollback boundary, and cloud no-mutation rules. The checked-in `prebuild` gate rejects every Vercel production build until the final reviewed release task removes that lock.

Production remains **NO-GO** until staging evidence is complete and a separate explicit human go/no-go is recorded.
