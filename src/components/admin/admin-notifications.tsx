import { saveAdminNotification } from "@/app/admin/notifications/actions";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminNotificationManager } from "@/components/admin/admin-notification-manager";
import { PageHeader } from "@/components/shell/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import type { AdminNotificationsAccess } from "@/lib/admin/access";
import { formatNumber } from "@/lib/format";

type AdminNotificationsProps = {
  access: AdminNotificationsAccess;
};

export function AdminNotifications({ access }: AdminNotificationsProps) {
  const authorized = access.status === "authorized" ? access : null;
  const notices = authorized?.notifications.notifications ?? [];
  // The loader stamps the evaluation instant; without one, windows cannot be judged and
  // only the active flag is counted.
  const evaluatedAt = authorized?.evaluatedAt;
  const activeNow = notices.filter(
    (note) =>
      note.active &&
      (evaluatedAt === undefined ||
        ((!note.starts_at || Date.parse(note.starts_at) <= evaluatedAt) &&
          (!note.expires_at || Date.parse(note.expires_at) >= evaluatedAt))),
  ).length;
  const scheduled =
    evaluatedAt === undefined
      ? 0
      : notices.filter(
          (note) => note.active && note.starts_at && Date.parse(note.starts_at) > evaluatedAt,
        ).length;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Notifications"
        titleId="admin-notifications-heading"
        description="In-app notices shown to account holders in the console and the desktop terminal."
      />
      <div className="page-content">
        <AdminGate access={access} section="Notifications">
          {authorized && (
            <>
              <StatGrid columns={3} label="Notification summary">
                <Stat label="Total notices" value={formatNumber(notices.length)} />
                <Stat label="Showing now" value={formatNumber(activeNow)} />
                <Stat label="Scheduled" value={formatNumber(scheduled)} />
              </StatGrid>
              <AdminNotificationManager
                document={authorized.notifications}
                evaluatedAt={authorized.evaluatedAt}
                action={saveAdminNotification}
              />
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
