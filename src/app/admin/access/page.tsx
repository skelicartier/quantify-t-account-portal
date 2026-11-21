import type { Metadata } from "next";

import { AdminAccess } from "@/components/admin/admin-access";
import { getAdminStaffAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Access control" };
export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const access = await getAdminStaffAccess();

  return <AdminAccess access={access} now={requestNow()} />;
}
