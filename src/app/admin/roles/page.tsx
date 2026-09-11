import type { Metadata } from "next";

import { AdminRoleReport } from "@/components/admin/admin-role-report";
import { getAdminRoleReportAccess } from "@/lib/admin/access";
import { firstSearchValue, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Role reconciliation" };
export const dynamic = "force-dynamic";

type AdminRolesPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminRolesPage({ searchParams }: AdminRolesPageProps) {
  const params = await searchParams;
  const includeMatches = firstSearchValue(params.include) === "matches";
  const access = await getAdminRoleReportAccess(includeMatches);

  return <AdminRoleReport access={access} />;
}
