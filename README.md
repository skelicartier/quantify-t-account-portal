# Quantify Terminal Account Portal

Secure, web-only account surface for Quantify Terminal.

## Current rollout status

The repository currently includes the Next.js foundation, security headers, read-only integrated preflight, Supabase SSR login/logout, protected account routing, a UUID-scoped server DAL, and an allow-listed account overview DTO. The ordered Supabase identity/RBAC/session migrations live in the desktop repository and have **not** been applied to any cloud project.

Signup, recovery, MFA, administration, unified revocation, and the Azure Account API are later rollout tasks. In particular, the Account API implementation and deployment are future Task 8 work; this repository must not be treated as a completed production administration backend.

## Safety boundary

- Supabase Auth is the identity authority; account joins use only `auth.users.id` UUIDs.
- The portal uses only a browser-safe publishable Supabase key and server-managed, HttpOnly user cookies.
- Service-role, Azure storage, email-provider, signing, and deployment credentials must never enter this repository or Vercel runtime.
- The desktop PIN is device-local and is not part of any portal DTO, query, field, log, or analytics event.
- No build, test, preflight, or deployment command in this repository applies database migrations or reads desktop user records.
- Privileged and cross-user operations will go through the Azure Account API only after its future capability/RBAC rollout is complete.

## Account authentication

- `/login` submits credentials through a Server Action; passwords and tokens never enter returned page state or URLs.
- `/account` is protected by the Next.js proxy and independently revalidated in the server-only DAL.
- The overview reads named `app_profiles` columns under the verified Supabase UUID and maps them to an allow-listed DTO.
- Web sign-out uses Supabase `local` scope and clears only this portal's cookie family. It does not revoke desktop or other-device sessions.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local development.

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

This adds the offline cross-repository preflight. It reads only explicit checked-in paths and process-environment presence; it never opens real `.env` files or contacts cloud services. `npm run preflight:strict` is the production gate and intentionally fails while any warning remains.

A real authenticated login/refresh/logout and `/account` accessibility pass requires an explicitly authorized disposable staging account. Never run lifecycle or migration tests against production users.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the protected Vercel preview/staging procedure, environment allow-list, rollback boundary, and Azure/Supabase no-mutation rules. The checked-in `prebuild` gate rejects every Vercel production build until the final reviewed release task removes that lock.

Production remains **NO-GO** until staging evidence is complete and a separate explicit human go/no-go is recorded.
