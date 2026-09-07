import type { Metadata } from "next";

import { AdminUsers } from "@/components/admin/admin-users";
import { getAdminUsersAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams: Promise<{
    limit?: string | string[] | undefined;
    offset?: string | string[] | undefined;
  }>;
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

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const limit = Math.max(1, boundedInteger(firstSearchValue(params.limit), 50, 100));
  const offset = boundedInteger(firstSearchValue(params.offset), 0, 100000);
  const access = await getAdminUsersAccess(limit, offset);

  return <AdminUsers access={access} />;
}
