import type { Metadata } from "next";

import { AdminCredentials } from "@/components/admin/admin-platform-status";
import { getAdminCredentialStatusAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Credentials" };
export const dynamic = "force-dynamic";

export default async function AdminCredentialsPage() {
  const access = await getAdminCredentialStatusAccess();
  return <AdminCredentials access={access} />;
}
