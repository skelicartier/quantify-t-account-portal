import type { Metadata } from "next";

import { AdminReports } from "@/components/admin/admin-reports";
import { getAdminReportsAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const access = await getAdminReportsAccess();

  return <AdminReports access={access} />;
}
