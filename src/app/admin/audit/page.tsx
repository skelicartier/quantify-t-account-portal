import type { Metadata } from "next";

import { AdminAuditEvents } from "@/components/admin/admin-audit-events";
import { getAdminAuditEventsAccess } from "@/lib/admin/access";
import type { AccountApiAdminAuditFilters } from "@/lib/admin/account-api";

export const metadata: Metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

type AdminAuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function auditFilters(params: Record<string, string | string[] | undefined>) {
  const filters: AccountApiAdminAuditFilters = {};
  for (const name of [
    "actor_user_id",
    "event_type",
    "outcome",
    "request_id",
    "session_id",
    "source",
    "subject_user_id",
  ] as const) {
    const value = firstSearchValue(params[name])?.trim();
    if (value) filters[name] = value;
  }
  return filters;
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const params = await searchParams;
  const limit = Math.max(1, boundedInteger(firstSearchValue(params.limit), 50, 100));
  const offset = boundedInteger(firstSearchValue(params.offset), 0, 100000);
  const filters = auditFilters(params);
  const access = await getAdminAuditEventsAccess(limit, offset, filters);

  return <AdminAuditEvents access={access} />;
}
