import type { Metadata } from "next";

import { AdminEmail } from "@/components/admin/admin-email";
import { getAdminEmailAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Email Queue" };
export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const access = await getAdminEmailAccess();

  return <AdminEmail access={access} now={requestNow()} />;
}
