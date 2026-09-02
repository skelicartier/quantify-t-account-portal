# Staging readiness — source baseline

Date: 2026-09-02

This document records non-secret source findings only. No production setting, database, DNS record, Vercel project, Azure resource, Supabase project, or user record was changed.

## No user images anywhere in the portal

The portal handles **no user images**. It does not accept, store, process, proxy, resize, or display any uploaded picture, and it performs **no Storage access at all**: no bucket, no object read or write, no signed URL, no image proxy route, and no image-processing dependency.

`app_profiles.profile_photo_path` remains a pre-existing legacy column owned by the desktop application and its retained v1 profile RPC. Its rows and values are untouched: the portal simply never selects it, never projects it, and never writes it. No migration was added, no row was deleted, and no value was cleared.

## Verified from source

- The portal has exact dependency pins, tests, enforced challenge-compatible CSP plus baseline security headers, environment allow-list validation, Supabase SSR login/logout, website signup, PKCE confirmation bound to Supabase's trusted runtime redirect type, generic recovery/reset guarded by a consumed UUID/access-token-bound browser marker, source consent metadata, Supabase-managed CAPTCHA submission, protected account routing, and UUID-scoped DAL/DTO boundaries.
- The five-minute recovery marker closes ordinary-session reset access in the normal browser flow, but it uses the exchanged bearer token rather than a portal secret and has no atomic server nonce store. Source evidence therefore does not claim malicious bearer-token resistance or globally atomic one-time consumption.
- The desktop-owned ordered eleven-migration ledger represents immutable UUID identity, canonical Owner/Admin/Support/User roles, session inventory, append-only auth events, grants, RLS contracts, additive positive profile versions, an every-UPDATE version trigger, the retained legacy v1 profile mutation, and the identity-bound versioned v2 CAS RPC.
- The portal preflight assembles its structural schema evidence from an explicit eleven-file allow-list, while integrity observation enumerates the desktop `supabase/migrations` directory so an unpinned extra file cannot hide. Source integrity is proven by exact SHA-256 digests of the raw migration bytes: `supabase.migration-integrity` pins all eleven filename/digest pairs, and the collector enumerates the desktop `supabase/migrations` directory rather than only the pinned names, so an unpinned extra migration is reported instead of being invisible. Unavailable, incomplete, reordered, renamed, duplicated, extra, and drifted artifacts all block, which closes `sourceReady` on any byte change, including whitespace, comments, dynamic SQL, or inert additions.
- All eleven digests are pinned to the reviewed migration bytes and duplicated literally in the focused tests, so a production edit alone cannot repin one.
- The remaining structural SQL checks in `supabase.profile-contract` are untrusted defense-in-depth only. They can show that reviewed constructs are present; they are not evidence that arbitrary later SQL is safe. They make no bucket, Storage-policy, or photo claim of any kind. The retained legacy v1 argument list is asserted verbatim, including its legacy photo argument, purely to confirm the desktop-owned function was not altered.
- Portal profile source covers owner-scoped profile and preferences reads, forms, and Server Actions with optimistic profile-version receipts. Focused tests cover bounded input, stale and malformed receipts, provider failures, cross-owner rows, and generic unavailable errors.
- Profile and preferences mutations accept exactly two RPC envelope shapes. Success requires `error === null` plus one exact three-field receipt — `user_id`, `profile_version`, `updated_at` — whose owner UUID and `expectedVersion + 1` match, with any extra key rejected. Definitive staleness requires `data === null` with string error code `40001`. A missing or undefined `error`, a mixed data-plus-error pair, a numeric `40001`, a malformed receipt, a receipt still carrying a retired photo field, and a thrown call are all service failures that never report success.
- Authenticated loading distinguishes failure classes, and both guards on a route agree. `loadAccountProfile` and `loadAccountOverview` return `null` only when Auth reports no verified user, so `requireCurrentProfile` and `requireCurrentAccount` redirect only on that `null`. Provider errors, absent rows, malformed or cross-owner DTOs, transport throws, unusable identities, and server-client factory failures raise generic server-only unavailable errors, so an authenticated visitor sees a generic error page instead of a misleading login redirect and no provider detail is exposed. A root `src/app/error.tsx` renders failures raised by the account layout guard, and a route-segment `src/app/account/error.tsx` renders page-guard failures while keeping the account shell; a sibling boundary cannot catch its own layout's throw, which is why both exist. A cross-owner profile row is degraded rather than displayed.
- A stale compare-and-swap now returns the committed profile version and revalidates the read route, so the visitor can retry immediately instead of reloading by hand. When the committed version cannot be established exactly, the form keeps its existing token rather than guessing.
- Existing `AccountNavigation`, account layout, and keyboard-focus component tests are fixture-safe authenticated-route accessibility evidence. They do not add a production authentication bypass and are not live staging evidence.
- Playwright covers the unauthenticated `/account` redirect and axe-scans the four credential routes. `/account/profile` and `/account/preferences` therefore ship with component-level accessibility tests but **no end-to-end axe scan and no live save**, because an authenticated browser fixture needs an authorized managed project. Add both during staging verification.
- Known limitation: React resets the uncontrolled account form fields once a Server Action resolves, so a rejected submit restores the stored values while asking the visitor to review the highlighted field. The rejection triggers are narrow (a tampered version token, a tampered checkbox value, or one bounded text/phone violation), and the stale path deliberately relies on that reset to pull the other session's committed values in rather than letting a retry overwrite them. Echoing submitted values back would change all six portal forms and is deferred.
- The desktop remains the current Azure/Supabase schema owner. The dedicated Account API is not implemented or deployed yet.
- The marketing website has its Vercel/theme source contract.

## Current offline result

The integrated workspace reports 20 pass, 9 expected warnings, and 0 blocked checks. `sourceReady` is true for the checked-in contracts only; `stagingReady` and `productionReady` remain false until later immutable evidence and approval work exists.

Expected warnings currently cover legacy cloud PIN metadata, wildcard legacy Azure CORS, open legacy Azure Python ranges, absent Account API infrastructure, and missing authorized staging environment configuration.

The Owner/session/event and profile-contract checks pass against source, but the migrations remain unapplied and unverified against managed PostgreSQL. No live profile/preferences RPC or portal/desktop interoperability claim has been established. Account-lifecycle behavior likewise remains source-tested only; no email, callback, CAPTCHA, consent-retention, provisioning, or session claim has been verified against a managed project.

## Unknown until authorized staging access is available

- Live Supabase schema/migration parity, exact portal/desktop project identity, Auth email-confirmation settings, callback allow-list, Turnstile enforcement/rate limits, PKCE expiry/replay behavior, provisioning trigger, session behavior, and pgTAP/RLS behavior.
- Migration execution and validation against PostgreSQL catalogs, including `profile_version`, the unconditional trigger, retained legacy v1 behavior, the exact v2 identity/CAS/SQLSTATE/receipt/EXECUTE contract, and concurrent stale-write behavior.
- Live Azure code hash, app settings, role registry, CORS, Key Vault, and monitoring configuration.
- Vercel team/project linkage, account-domain DNS/TLS ownership, and deployment protection.
- Custom SMTP sender verification and SPF/DKIM/DMARC state.

## Safe validation

A standalone portal clone runs:

```bash
npm run validate:portal
npm run test:e2e
```

The integrated workspace additionally runs:

```bash
npm run validate
npm run preflight:strict
```

`preflight:strict` exits unsuccessfully while `productionReady` remains false; warnings and blockers therefore cannot unlock production. Offline preflight reads the eleven explicit migration files, performs source-only structural lifecycle/profile checks, evaluates the exported Next.js header rules, and inspects only process-environment names/status. It never opens real `.env` files, emits configured values, connects to PostgreSQL, touches any Storage service, or mutates cloud resources.

## Production gate

Production is intentionally **NO-GO**. Production mutations require authorized staging evidence, PostgreSQL/pgTAP execution, the future Azure Account API and RBAC parity, a current backup/rollback package, and a separate explicit go/no-go confirmation.
