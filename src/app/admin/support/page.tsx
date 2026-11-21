import type { Metadata } from "next";

import { AdminSupport } from "@/components/admin/admin-support";
import { getAdminSupportAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const access = await getAdminSupportAccess();

  return <AdminSupport access={access} now={requestNow()} />;
}
