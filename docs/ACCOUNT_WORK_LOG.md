# Account Architecture Work Log

Updated: 2026-09-07. Current source resume point for the supplied architecture plan.

## Current Task

Task 18 source/offline validation has begun after the Task 17 source slice. Notification authoring/receipts/email queue, Owner-only status, audit search, caller-private report queues, account export/deletion state machines, same-origin Server Action provenance guards, private signed artifact-download endpoints, and disabled-by-default report/export/deletion cleanup workers now have source-only portal/API coverage. Managed-provider delivery evidence, Task 15 mutation evidence, live artifact-generation evidence, provider/Auth tombstone completion, and staging evidence are not implemented.

Implemented in this continuation:

- `/admin/notifications`: capability/AAL2-gated inventory, create/edit, selected/all/active recipients, UTC scheduling and expiry, pause/resume through the Active toggle, and duplication into a paused draft.
- Publishing rechecks authentication, capability, and AAL2 inside the Server Action. It reloads the document, edits one notice, preserves other records and creation timestamps, and submits an expected revision and server-generated idempotency key.
- `/account/notifications`: caller-scoped notices, plain-text content, HTTPS-only links, read/dismiss/click receipt submission, persisted read/dismiss state, compact history, empty and error states.
- `/notifications/state`: source-only receipt state/history route derived from append-only `notification.receipt` audit events. It exposes only notification id, status, and timestamps; raw metadata is not returned.
- `/admin/email`: capability/AAL2-gated email queue page backed by Account API `/admin/email` and `/admin/email/enqueue`. Queue writes require expected revisions and server-generated idempotency keys, reject unsafe content and malformed selected targets, enforce source quotas, and audit `notification.email_queued`.
- `/admin/email/{job_id}/outcome`: source-only outcome transition for future workers/admin tooling. It requires the same capability, expected revisions and idempotency, marks `sent`, schedules `retry`, and dead-letters after max attempts while auditing `notification.email_outcome`.
- `notification_email_worker`: source-only timer worker contract in the Account API. It is disabled unless `QT_ACCOUNT_API_EMAIL_WORKER_ENABLED` and server-side Brevo settings are present, claims a due job before any provider call, expands recipients from minimized profile rows, records generic sent/retry/dead-letter outcomes, and audits only recipient counts.
- `/admin/configuration`, `/admin/credentials`, `/admin/releases`: Owner-only source status surfaces. They require exact Account API capabilities plus AAL2 in the portal, expose only counts/limits/booleans/source-lock state, and return no URLs, keys, connection strings, sender addresses, release artifacts, break-glass UUIDs, or bootstrap admin UUIDs.
- `/admin/reports`: audit-capability/AAL2-gated source report queue page backed by Account API `/admin/reports`, `/admin/reports/enqueue`, and `/admin/reports/{report_id}/download`. Jobs are caller-private, exact-filtered, revision-checked, idempotent on enqueue, and list only expiring private descriptors with no artifact refs, CSV bodies, raw metadata, provider session IDs, network fields, credentials, or Support-redacted fields.
- `/account/data`: caller-scoped export and deletion controls. Export/deletion/cancel actions recheck the session, mutation assurance, current password, typed confirmation, and expected revision before calling the Account API with a server-generated idempotency key.
- `/account/lifecycle`, `/account/exports/request`, `/account/exports/{export_id}/download`, `/account/deletion/request`, and `/account/deletion/cancel`: source-only Account API lifecycle routes. They expose caller-private export/deletion state, queue encrypted export metadata, list only private descriptors, enforce 14-day deletion cooling-off and legal-hold blockers, allow cancellation before the deadline, track retry/cleanup steps, and audit only bounded scalar metadata.
- `PrivateArtifactDownloadStore`: source-only signed URL minting for ready caller-owned reports and encrypted exports. It requires an explicit signed-download enable flag and private artifact container, rejects bad refs, clips URL lifetime to the stored job expiry, verifies blob byte count and `sha256` metadata before signing, and keeps list endpoints from minting links.
- `report_worker` and `account_export_worker`: disabled-by-default Account API timer contracts for private artifacts. The report worker generates formula-safe CSV artifacts from bounded audit reads. The export worker builds bounded account-owned JSON sections, encrypts them with a server Fernet key, writes `.json.enc` artifacts, and records only scalar audit metadata.
- `account_deletion_worker`: disabled-by-default Account API timer contract for cooled-off deletion requests. It revokes Account API session rows, deletes only exact ready export artifact refs in the private artifact container, records source-locked Auth/tombstone steps, persists retry/blocked status, and audits only scalar metadata.
- `requireSameOriginServerAction`: shared portal guard for all exported mutating Server Actions. In production it requires the request `Origin` or `Referer` origin to match the configured portal origin before any provider/API/credential mutation; requestless calls are allowed only outside production for unit tests.
- Blob writes use the downloaded ETag atomically; first creation refuses to overwrite an existing blob. Read failures and malformed documents cannot become an empty replacement. Only `BlobNotFound` means an empty inventory.
- API revision is mandatory, including an empty revision for initial creation. UUID revisions remain unique with a frozen clock. Invalid or malformed stored targets fail closed instead of becoming broadcasts. Non-dismissible notices reject dismissal receipts.
- Admin notification updates reject stored documents that cannot round-trip through the current authoring contract without data loss. The API returns `notification_document_incompatible`; no write or audit event is produced.
- Tests cover authorization, MFA, stale edits, duplicate fields, unsafe content/links, schedules/targets, record preservation, storage races, and receipt authorization.
- Preflight pins the same-origin helper shape, confirms every exported async action in the reviewed action-file allow-list calls `requireSameOriginServerAction` directly, and now requires private artifact downloads to be signed only after server-side digest/size checks.

## Verification

- Portal: 68 test files, 725 tests passed.
- Focused worker/preflight/admin status suites passed with 188 tests.
- Focused same-origin, lifecycle/API/preflight, and touched action suites passed.
- Playwright auth/accessibility routing: 32 passed across desktop and mobile, including direct unauthenticated navigation to `/account/data`.
- Account API: 367 tests passed with cloud dependencies stubbed.
- Typecheck, lint, Prettier check, local optimized build, and whitespace checks passed.
- `npx tsx scripts/check-notification-ui.ts`: desktop/mobile publishing and receipt interactions, no horizontal page overflow, no browser errors, zero axe violations. Uses local React fixtures and mocked actions, not authenticated managed services. Screenshots: `test-results/notifications/`.
- Offline preflight: 26 pass, 8 warnings, 0 blocked; `sourceReady=true`, `stagingReady=false`, `productionReady=false`.
- Production build lock and strict-production preflight still reject release as expected.
- Independent semantic review of the notification remediation and receipt-state slice is approved.
  The email queue/outcome/worker, report queue/download/generation, and account lifecycle export/deletion/generation slices still need independent semantic review before any focused commit.

These are source checks. No cloud project, live user, migration, provider setting, or deployment was changed. Focused commits/pushes remain pending.

## Final Local Checkpoint

The public portal brand is `console.quantifyterminal.com`; this source rename does not
change internal `/account`, `/admin`, or authentication callback paths. Live DNS,
Vercel domain attachment, Supabase redirect settings, and Account API CORS remain
separate approved configuration work.

The local/source account-architecture implementation is complete for the reviewed Task
17, Task 18, private artifact download, report/export artifact worker, and deletion
cleanup worker slices. Staging and production remain locked: `stagingReady=false` and
`productionReady=false` are intentional until authorized cloud evidence proves the
remaining provider email delivery, Storage signing, export retrieval/decryption,
provider/Auth tombstone completion, migration, deployment, monitoring, backup, and
rollback paths.

## Next Work

1. Finish Task 14 staging evidence: provider email delivery, deliverability checks, security-notification triggers, and managed retention/performance evidence. Receipt state is source-only and derived from recent audit events.
2. Finish open Tasks 9-13: backend-driven navigation, recent Owner reauthentication, provider session revocation/retention, desktop handoff, full metrics and role-controlled administration. Keep legacy administration until verified portal parity.
3. Continue Task 15 writes: write-only credential rotation, Key Vault references, release publishing/rollback, server signature validation, publish-before-email ordering, and staging evidence.
4. Continue Tasks 16-17: live private-storage evidence, export decryption/retrieval UX, provider/Auth tombstone completion, and authorized deletion cleanup staging evidence.
5. Continue Task 18 managed validation: network probes, real staging Auth/Azure/Supabase/pgTAP/visual/load/security suites, redacted logs/alerts/backups/recovery evidence, and independent semantic reviews before focused commits. Preserve unrelated desktop edits.
6. Task 19 remains blocked on authorized staging evidence, backups/rollback rehearsal, and a separate production go/no-go. Keep the deployment lock and readiness flags.

## Repositories

- Portal: `../Quantify Terminal Account Portal`.
- Account API/desktop: `../Quantify Terminal`; package `cloud/azure/account_function/`, tests `tests/test_account_api.py`, contract `docs/ACCOUNT_API.md`.

The supplied architecture plan remains authoritative for requirements and boundaries. This log records progress beyond its older Task 6 checkpoint.
