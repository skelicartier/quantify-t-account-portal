import type { Metadata } from "next";

import { AdminSubscriptions } from "@/components/admin/admin-subscriptions";
import { getAdminSubscriptionsAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const access = await getAdminSubscriptionsAccess();

  return <AdminSubscriptions access={access} now={requestNow()} />;
}
