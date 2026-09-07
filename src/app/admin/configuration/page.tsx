import type { Metadata } from "next";

import { AdminConfiguration } from "@/components/admin/admin-platform-status";
import { getAdminConfigurationAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Configuration" };
export const dynamic = "force-dynamic";

export default async function AdminConfigurationPage() {
  const access = await getAdminConfigurationAccess();
  return <AdminConfiguration access={access} />;
}
