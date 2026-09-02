# Staging readiness — source baseline

Date: 2026-09-02

This document records non-secret source findings only. No production setting, database, DNS record, Vercel project, Azure resource, Supabase project, or user record was changed.

## Verified from source

- The portal has exact dependency pins, tests, enforced challenge-compatible CSP plus baseline security headers, environment allow-list validation, Supabase SSR login/logout, website signup, PKCE confirmation bound to Supabase's trusted runtime redirect type, generic recovery/reset guarded by a consumed UUID/access-token-bound browser marker, source consent metadata, Supabase-managed CAPTCHA submission, protected account routing, and a UUID-scoped DAL/DTO.
- The five-minute recovery marker closes ordinary-session reset access in the normal browser flow, but it uses the exchanged bearer token rather than a portal secret and has no atomic server nonce store. Source evidence therefore does not claim malicious bearer-token resistance or globally atomic one-time consumption.
- The desktop-owned ordered migration ledger represents immutable UUID identity, canonical Owner/Admin/Support/User roles, session inventory, append-only auth events, grants, and RLS contracts.
- The portal preflight reads the eight migration filenames through an explicit allow-list; it never uses glob discovery.
- The desktop remains the current Azure/Supabase schema owner. The dedicated Account API is not implemented or deployed yet.
- The marketing website has its Vercel/theme source contract.

## Current offline result

The integrated workspace reports 18 pass, 9 expected warnings, and 0 blocked checks. `sourceReady` is true for the checked-in contracts only; `stagingReady` and `productionReady` remain false until later immutable evidence and approval work exists.

Expected warnings currently cover legacy cloud PIN metadata, wildcard legacy Azure CORS, open legacy Azure Python ranges, absent Account API infrastructure, and missing authorized staging environment configuration.

The Owner/session/event migration warnings from the earlier baseline are resolved in source, but the migrations remain unapplied and unverified against PostgreSQL. Task 5 account-lifecycle behavior is likewise source-tested only; no email, callback, CAPTCHA, consent-retention, provisioning, or portal/desktop interoperability claim has been verified against a managed project.

## Unknown until authorized staging access is available

- Live Supabase schema/migration parity, exact portal/desktop project identity, Auth email-confirmation settings, callback allow-list, Turnstile enforcement/rate limits, PKCE expiry/replay behavior, provisioning trigger, session behavior, and pgTAP/RLS behavior.
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

`preflight:strict` exits unsuccessfully while `productionReady` remains false; warnings and blockers therefore cannot unlock production. Offline preflight reads explicit lifecycle files into per-file AST relationship checks, evaluates the exported Next.js header rules, and inspects only process-environment names/status. It never opens real `.env` files, emits configured values, or mutates cloud resources.

## Production gate

Production is intentionally **NO-GO**. Production mutations require authorized staging evidence, PostgreSQL/pgTAP execution, the future Task 8 Azure Account API and RBAC parity, a current backup/rollback package, and a separate explicit go/no-go confirmation.
