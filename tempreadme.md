# Gate 2C: Password-Preserving Backup — Progress Update

**Date:** 2026-09-07
**Status:** GATE 2C IN PROGRESS — Pooler routing issue identified
**Decision:** Option A — pg_dump from Mac via mobile hotspot

---

## What Was Tried (in order)

### Attempt 1: Direct DB connection (Wi-Fi)

- `db.mloeddeqifhtlwuminzy.supabase.co` resolves to **IPv6 only** (AAAA: `2406:da1a:314:7102:751e:99d6:77fa:10b1`)
- Mac has no IPv6 route → **FAILED** "No route to host"

### Attempt 2: Pooler via Wi-Fi

- `aws-0-ap-southeast-1.pooler.supabase.com` (wrong region — project is in Mumbai)
- Connection timeout → **FAILED**

### Attempt 3: Mobile hotspot connection test (Gate 2C Plan A)

- Hotspot has **no IPv6** → direct DB still fails
- Pooler (ap-southeast-1, wrong region) → "tenant/user not found"

### Attempt 4: Correct Mumbai pooler (ap-south-1)

- `aws-0-ap-south-1.pooler.supabase.com:5432` → "tenant/user not found"
- `aws-0-ap-south-1.pooler.supabase.com:6543` → "tenant/user not found"
- Root cause: **Wrong pooler region** — CLI stored `ap-southeast-1` but project is in Mumbai

### Attempt 5: Fixed CLI config to ap-south-1

- Updated `~/.supabase/config.json` host to `aws-0-ap-south-1.pooler.supabase.com`
- `supabase link` succeeds (Management API works)
- `supabase db dump --linked` → "IPv6 is not supported" (CLI always tries direct DB first)
- `supabase db dump --db-url` → "tenant/user not found" (pg_dump can't set SNI)

### Attempt 6: TLS SNI proxy (double-TLS MITM)

- Wrote Python proxy that does TLS with pooler using correct SNI (`db.mloeddeqifhtlwuminzy.supabase.co`)
- SNI IS set correctly → "Double TLS OK"
- Pooler still returns "tenant/user not found" or "no tenant identifier"
- **Conclusion:** Pooler routing may need correct password, or project pooler needs re-registration after restore

---

## Key Findings

| Finding                     | Detail                                                         |
| --------------------------- | -------------------------------------------------------------- |
| **Project region**          | South Asia (Mumbai) — `ap-south-1`                             |
| **CLI stored wrong region** | Was `ap-southeast-1`, fixed to `ap-south-1`                    |
| **Direct DB**               | IPv6 ONLY (AAAA record, zero A records from all DNS resolvers) |
| **Mac IPv6 support**        | NONE — not on Wi-Fi, not on mobile hotspot                     |
| **Pooler reachable**        | YES — TCP connections succeed on both ports 5432 and 6543      |
| **Pooler routing**          | FAILS — "tenant/user not found" even with correct SNI          |
| **REST API**                | WORKS — 173 app_profiles confirmed                             |
| **Supabase CLI link**       | WORKS — Management API accessible                              |

---

## Why Pooler Routing Fails

The Supabase pooler uses different routing depending on mode:

| Mode        | Port | Routing Method                        | Error                   |
| ----------- | ---- | ------------------------------------- | ----------------------- |
| Session     | 5432 | Username (`postgres.<ref>`)           | "tenant/user not found" |
| Transaction | 6543 | SNI hostname (`db.<ref>.supabase.co`) | "no tenant identifier"  |

**Possible causes:**

1. Pooler routing table not updated after project restore from pause
2. Password mismatch (password provided may be for NEW project, not old one)
3. Pooler needs specific connection format shown in Supabase Dashboard

---

## What's Needed

**User action required:**

1. Go to https://supabase.com/dashboard
2. Select project `mloeddeqifhtlwuminzy`
3. Go to **Settings** → **Database**
4. Copy the **URI** connection string (replace password with `YOUR_PASSWORD`)
5. Paste it here

This will reveal the exact pooler hostname, port, and username format Supabase expects for this specific project.

---

## Backup Files Status

| File                             | Status          |
| -------------------------------- | --------------- |
| `old-prod-full.sql`              | NOT YET CREATED |
| `old-prod-auth.sql`              | NOT YET CREATED |
| `old-prod-public-schema.sql`     | NOT YET CREATED |
| `old-prod-public-data.sql`       | NOT YET CREATED |
| `old-prod-row-counts.json`       | NOT YET CREATED |
| `old-prod-schema-inventory.json` | NOT YET CREATED |

**From Gate 2A (REST API backup — no password hashes):**

| File                          | Rows | Status                  |
| ----------------------------- | ---- | ----------------------- |
| `app_profiles-data.json`      | 173  | ✅                      |
| `app_user_profiles-data.json` | 173  | ✅                      |
| `watchlists-data.json`        | 173  | ✅                      |
| `auth-users.json`             | 173  | ✅ (no password hashes) |

---

## Tools Installed

| Tool                     | Version            | Status |
| ------------------------ | ------------------ | ------ |
| PostgreSQL client (psql) | 16.15 (Homebrew)   | ✅     |
| pg_dump                  | 16.15 (Homebrew)   | ✅     |
| Supabase CLI             | 2.116.0 (Homebrew) | ✅     |
| Docker Desktop           | Running            | ✅     |
| socat                    | 1.8.1.3 (Homebrew) | ✅     |

---

## Old Production Not Mutated Confirmation

All operations are **read-only**:

- `pg_dump` = SELECT queries only
- `psql` with `SELECT` = read-only
- REST API queries = read-only
- No `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP` executed
- Old production `mloeddeqifhtlwuminzy` remains **untouched**

---

## Production Status

**NO-GO** — Password-preserving backup not yet completed.

| Gate                              | Status                                                 |
| --------------------------------- | ------------------------------------------------------ |
| Gate 1: Identify real production  | ✅ COMPLETE                                            |
| Gate 2A: REST API backup          | ✅ COMPLETE                                            |
| Gate 2B: pg_dump (direct)         | ❌ BLOCKED (IPv6)                                      |
| Gate 2C: pg_dump (pooler/hotspot) | 🔄 IN PROGRESS — waiting for correct connection string |
| Gate 3: Create new production     | ⏳ PENDING                                             |
| Gate 4: Export all data           | ⏳ PENDING                                             |
| Gate 5: Import into new project   | ⏳ PENDING                                             |
| Gate 6: Deploy production API     | ⏳ PENDING                                             |
| Gate 7: Configure Vercel          | ⏳ PENDING                                             |
| Gate 8: Attach domain + DNS       | ⏳ PENDING                                             |
| Gate 9: E2E test + monitoring     | ⏳ PENDING                                             |
