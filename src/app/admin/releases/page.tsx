import type { Metadata } from "next";

import { AdminReleases } from "@/components/admin/admin-platform-status";
import { getAdminReleaseStatusAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

export default async function AdminReleasesPage() {
  const access = await getAdminReleaseStatusAccess();
  return <AdminReleases access={access} />;
}
