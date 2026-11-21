import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminDashboardAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAdminDashboardAccess();
  return <AdminDashboard access={access} now={requestNow()} />;
}
