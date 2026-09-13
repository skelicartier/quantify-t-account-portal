import type { Metadata } from "next";

import { publishRelease, rollbackRelease, setReleaseDisabled } from "@/app/admin/releases/actions";
import { AdminReleases } from "@/components/admin/admin-platform-status";
import { getAdminReleaseStatusAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

export default async function AdminReleasesPage() {
  const access = await getAdminReleaseStatusAccess();
  return (
    <AdminReleases
      access={access}
      now={requestNow()}
      publish={publishRelease}
      rollback={rollbackRelease}
      setDisabled={setReleaseDisabled}
    />
  );
}
