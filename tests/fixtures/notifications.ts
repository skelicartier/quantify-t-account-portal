import type { AccountApiAdminNotifications } from "@/lib/admin/account-api";
import type { NotificationInput } from "@/lib/notifications/input";

export const notification: NotificationInput = {
  id: "notice1",
  title: "Scheduled maintenance",
  body: "Account services will restart.",
  severity: "info",
  display: "center",
  active: true,
  dismissible: true,
  starts_at: "",
  expires_at: "",
  actions: [],
  target: { mode: "all", user_ids: [], emails: [] },
};
export const notificationDocument: AccountApiAdminNotifications = {
  ok: true,
  correlation_id: "qt-notifications",
  revision: "revision-123456",
  notifications: [{ ...notification, created_at: "2026-09-01T00:00:00Z" }],
};
