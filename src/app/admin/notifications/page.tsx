import type { Metadata } from "next";

import { AdminNotifications } from "@/components/admin/admin-notifications";
import { getAdminNotificationsAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const access = await getAdminNotificationsAccess();

  return <AdminNotifications access={access} />;
}
