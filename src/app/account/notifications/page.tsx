import type { Metadata } from "next";
import { AccountNotifications } from "@/components/account/account-notifications";
import { requireCurrentNotificationCenter } from "@/lib/dal/notifications";
import { acknowledgeNotification } from "./actions";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { document, state } = await requireCurrentNotificationCenter();
  return (
    <AccountNotifications
      notifications={document.notifications}
      receiptState={state}
      action={acknowledgeNotification}
      now={requestNow()}
    />
  );
}
