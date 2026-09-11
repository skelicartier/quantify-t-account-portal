import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AdminNotificationManager } from "@/components/admin/admin-notification-manager";
import { AccountNotifications } from "@/components/account/account-notifications";
import { notificationDocument } from "../notifications";
import type { AccountApiNotificationState } from "@/lib/admin/account-api";
import type { NotificationInput } from "@/lib/notifications/input";
import "@/app/globals.css";

function Fixture() {
  const [document, setDocument] = useState(notificationDocument);
  const [receiptState, setReceiptState] = useState<
    Pick<AccountApiNotificationState, "state" | "receipts">
  >({ state: [], receipts: [] });
  return (
    <div className="shell">
      {location.search === "?account" ? (
        <AccountNotifications
          notifications={document.notifications}
          receiptState={receiptState}
          action={async (_state, form) => {
            const notificationId = String(form.get("notificationId") || "");
            const status = String(form.get("status") || "") as "read" | "dismissed" | "clicked";
            const now = new Date().toISOString();
            const receipt = {
              id: crypto.randomUUID(),
              notification_id: notificationId,
              status,
              occurred_at: now,
              created_at: now,
            };
            setReceiptState((current) => ({
              state: [
                {
                  notification_id: notificationId,
                  status,
                  occurred_at: now,
                },
                ...current.state.filter((item) => item.notification_id !== notificationId),
              ],
              receipts: [receipt, ...current.receipts].slice(0, 12),
            }));
            return {
              status: "success",
              message: status === "dismissed" ? "Dismissal recorded." : "Response recorded.",
            };
          }}
        />
      ) : (
        <main className="shell__main">
          <header className="page-header">
            <div className="page-header__body">
              <p className="eyebrow">Administration</p>
              <h1>Notifications</h1>
            </div>
          </header>
          <AdminNotificationManager
            document={document}
            evaluatedAt={Date.parse("2026-09-05T00:00:00Z")}
            action={async (_state, form) => {
              const input = JSON.parse(String(form.get("notification"))) as NotificationInput;
              const saved = {
                ...input,
                id: input.id || crypto.randomUUID(),
                created_at: "2026-09-05T00:00:00Z",
              };
              setDocument((current) => ({
                ...current,
                revision: crypto.randomUUID(),
                notifications: input.id
                  ? current.notifications.map((note) => (note.id === input.id ? saved : note))
                  : [...current.notifications, saved],
              }));
              return { status: "success", message: "Notification saved." };
            }}
          />
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
