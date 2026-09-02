# Quantify Terminal Account Portal

Secure, web-only account surface for Quantify Terminal.

## Current rollout status

The repository currently includes the Next.js foundation, enforced security headers, read-only integrated preflight, Supabase SSR login/logout, website signup, PKCE email confirmation, non-enumerating password recovery/reset, explicit legal-consent metadata, Supabase-managed Turnstile challenge submission, protected account routing, a UUID-scoped server DAL, and an allow-listed account overview DTO. The ordered Supabase identity/RBAC/session migrations live in the desktop repository and have **not** been applied to any cloud project.

Task 5 is complete in source only. Managed email delivery, redirect allow-lists, CAPTCHA enforcement, provisioning, and same-account portal/desktop behavior remain unverified staging evidence. MFA, administration, unified revocation, and the Azure Account API are later rollout tasks. In particular, the Account API implementation and deployment are future Task 8 work; this repository must not be treated as a completed production administration backend.

## Safety boundary

- Supabase Auth is the identity authority; account joins use only `auth.users.id` UUIDs.
- The portal uses only a browser-safe publishable Supabase key and server-managed, HttpOnly user cookies.
- Service-role, Azure storage, email-provider, signing, and deployment credentials must never enter this repository or Vercel runtime.
- The desktop PIN is device-local and is not part of any portal DTO, query, field, log, or analytics event.
- No build, test, preflight, or deployment command in this repository applies database migrations or reads desktop user records.
- Privileged and cross-user operations will go through the Azure Account API only after its future capability/RBAC rollout is complete.

## Account authentication

- `/login`, `/signup`, and `/forgot-password` submit through Server Actions; passwords, challenge responses, provider details, and tokens never enter returned page state or URLs.
- Login, signup, and recovery pass the browser-safe Turnstile response to Supabase Auth as `captchaToken`; the private verification secret remains in the managed Supabase project, not this portal.
- Signup uses the configured portal origin for a fixed PKCE callback and returns the same accepted response for new and existing addresses.
- Required Terms/Privacy acceptance is captured with server-owned version, source, and timestamp metadata. This source metadata is not claimed to be an immutable legal receipt.
- `/auth/confirm` accepts one bounded PKCE code, ignores arbitrary destinations, binds the requested flow to Supabase's runtime `redirectType`, and redirects only to `/account` or `/reset-password`. A mismatch clears the exchanged portal session.
- Recovery returns one generic accepted response for known and unknown addresses. A trusted recovery exchange issues a five-minute, HttpOnly marker bound to the exact Auth UUID and access token; reset consumes that browser marker before updating the revalidated identity, then clears only the portal-local session.
- The recovery marker is a normal-browser flow guard, not a new root of trust: it is signed with the exchanged bearer access token because this task forbids a portal signing secret or server-side nonce store. It is not globally atomic across concurrent requests and does not defend against a malicious holder of that bearer token. Those stronger guarantees require separately approved server-held secret/state and remain outside this source-only task.
- `/account` is protected by the Next.js proxy and independently revalidated in the server-only DAL.
- The overview reads named `app_profiles` columns under the verified Supabase UUID and maps them to an allow-listed DTO.
- Web sign-out uses Supabase `local` scope and clears only this portal's cookie family. It does not deliberately revoke desktop or other-device sessions.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local development.
- Credential and callback routes are private/no-store, and the enforced CSP permits only the reviewed Cloudflare challenge, Supabase, and Azure endpoint classes.

The current desktop signup expects Supabase to return a session immediately. Do **not** enable mandatory email confirmation on the shared/live Auth project until an authorized staging desktop regression and the later desktop migration prove coexistence. Source code alone also cannot prove that portal and desktop point at the same managed Supabase project.

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

This adds the offline cross-repository preflight. It reads only explicit checked-in paths and process-environment presence; it never opens real `.env` files or contacts cloud services. `npm run preflight:strict` remains nonzero while `productionReady` is locked, including while any warning remains.

A real authenticated login/refresh/logout and `/account` accessibility pass requires an explicitly authorized disposable staging account. Never run lifecycle or migration tests against production users.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the protected Vercel preview/staging procedure, environment allow-list, rollback boundary, and Azure/Supabase no-mutation rules. The checked-in `prebuild` gate rejects every Vercel production build until the final reviewed release task removes that lock.

Production remains **NO-GO** until staging evidence is complete and a separate explicit human go/no-go is recorded.
