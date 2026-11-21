import type { Metadata } from "next";

import { AdminSecrets } from "@/components/admin/admin-secrets";
import { getAdminSecretsAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Provider keys" };
export const dynamic = "force-dynamic";

export default async function AdminSecretsPage() {
  const access = await getAdminSecretsAccess();

  return <AdminSecrets access={access} now={requestNow()} />;
}
