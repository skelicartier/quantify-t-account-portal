import type { Metadata } from "next";

import { AdminRoleReport } from "@/components/admin/admin-role-report";
import { getAdminRoleReportAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Role Reconciliation" };
export const dynamic = "force-dynamic";

type AdminRolesPageProps = {
  searchParams: Promise<{ include?: string | string[] | undefined }>;
};

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminRolesPage({ searchParams }: AdminRolesPageProps) {
  const params = await searchParams;
  const includeMatches = firstSearchValue(params.include) === "matches";
  const access = await getAdminRoleReportAccess(includeMatches);

  return <AdminRoleReport access={access} />;
}
