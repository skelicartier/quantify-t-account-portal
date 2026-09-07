import Link from "next/link";

import { saveAdminNotification } from "@/app/admin/notifications/actions";
import { AdminNotificationManager } from "@/components/admin/admin-notification-manager";
import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminNotificationsAccess } from "@/lib/admin/access";

type AdminNotificationsProps = {
  access: AdminNotificationsAccess;
};

export function AdminNotifications({ access }: AdminNotificationsProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-notifications-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-notifications-heading">Notifications</h1>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section
          className="admin-state-panel"
          aria-labelledby="admin-notifications-forbidden-heading"
        >
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-notifications-forbidden-heading">
            This account is not authorized for administration
          </h2>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-notifications-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-notifications-mfa-heading">A verified second factor is required</h2>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "capability-required" && (
        <section
          className="admin-state-panel"
          aria-labelledby="admin-notifications-capability-heading"
        >
          <p className="account-card__label">Capability required</p>
          <h2 id="admin-notifications-capability-heading">Notification authoring is not granted</h2>
          <p>{access.capability}</p>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <dl className="notification-summary" aria-label="Notification summary">
            <div>
              <dt>Total</dt>
              <dd>{formatAdminNumber(access.notifications.notifications.length)} notices</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd className="account-id">{access.notifications.revision || "None"}</dd>
            </div>
          </dl>

          <section className="admin-section" aria-labelledby="admin-notifications-table-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Notices</p>
                <h2 id="admin-notifications-table-heading">All notices</h2>
              </div>
            </div>
            <AdminNotificationManager
              document={access.notifications}
              evaluatedAt={access.evaluatedAt}
              action={saveAdminNotification}
            />
          </section>
        </>
      )}
    </main>
  );
}
