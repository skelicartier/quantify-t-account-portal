"use client";

import { Check, ExternalLink, X } from "lucide-react";
import { useActionState, useMemo, useTransition } from "react";

import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountApiNotificationState, AccountApiNotifications } from "@/lib/admin/account-api";
import { formatLabel } from "@/lib/format";
import {
  INITIAL_NOTIFICATION_STATE,
  safeNotificationHref,
  type NotificationActionState,
} from "@/lib/notifications/input";

type Props = {
  notifications: AccountApiNotifications["notifications"];
  receiptState?: Pick<AccountApiNotificationState, "state" | "receipts">;
  action: (state: NotificationActionState, data: FormData) => Promise<NotificationActionState>;
  now?: number | undefined;
};

const RECEIPT_LABELS: Record<string, string> = {
  seen: "Seen",
  read: "Marked as read",
  dismissed: "Dismissed",
  clicked: "Opened a link",
};

const HISTORY_COLUMNS = [
  { key: "action", label: "Action" },
  { key: "notice", label: "Notice" },
  { key: "when", label: "When" },
] as const;

function Notification({
  note,
  receipt,
  action,
}: {
  note: Props["notifications"][number];
  receipt: Pick<AccountApiNotificationState["state"][number], "status" | "occurred_at"> | undefined;
  action: Props["action"];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_NOTIFICATION_STATE);
  const [, startTransition] = useTransition();
  const recordClick = () => {
    const data = new FormData();
    data.set("notificationId", note.id);
    data.set("status", "clicked");
    startTransition(() => {
      void action(INITIAL_NOTIFICATION_STATE, data);
    });
  };
  const title = note.title || "Account notice";
  return (
    <article className={`notice notice--${note.severity}`}>
      <p className="notice__meta">
        <span>{formatLabel(note.severity)}</span>
        {receipt && <span>{RECEIPT_LABELS[receipt.status] ?? formatLabel(receipt.status)}</span>}
      </p>
      <h2 className="notice__title">{title}</h2>
      <p className="notice__body">{note.body}</p>
      <form action={formAction}>
        <input type="hidden" name="notificationId" value={note.id} />
        <div className="notice__actions">
          {note.actions.map((item, index) => {
            if (item.kind === "dismiss") {
              return note.dismissible ? (
                <Button
                  key={index}
                  size="small"
                  type="submit"
                  name="status"
                  value="dismissed"
                  disabled={pending}
                >
                  {item.label}
                </Button>
              ) : null;
            }
            const href = safeNotificationHref(item.url);
            return href ? (
              <a
                key={index}
                className={buttonClass({
                  size: "small",
                  variant: item.primary ? "primary" : "default",
                })}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordClick}
              >
                {item.label}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            ) : null;
          })}
          <Button size="small" type="submit" name="status" value="read" disabled={pending}>
            <Check size={16} aria-hidden="true" />
            Mark read
          </Button>
          {note.dismissible && (
            <Button
              size="icon"
              variant="ghost"
              type="submit"
              name="status"
              value="dismissed"
              title="Dismiss notification"
              aria-label={`Dismiss ${title}`}
              disabled={pending}
            >
              <X size={16} />
            </Button>
          )}
        </div>
        {state.message && (
          <Callout
            tone={state.status === "error" ? "danger" : "success"}
            role={state.status === "error" ? "alert" : "status"}
            compact
          >
            {state.message}
          </Callout>
        )}
      </form>
    </article>
  );
}

export function AccountNotifications({ notifications, receiptState, action, now }: Props) {
  const receiptsByNotification = useMemo(
    () => new Map((receiptState?.state ?? []).map((item) => [item.notification_id, item])),
    [receiptState],
  );
  const visibleNotifications = notifications.filter(
    (note) => receiptsByNotification.get(note.id)?.status !== "dismissed",
  );
  const titles = new Map(notifications.map((note) => [note.id, note.title || "Account notice"]));
  const history = receiptState?.receipts.slice(0, 12) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        titleId="account-notifications-heading"
        description="Notices from the Quantify Terminal team about your account and the platform."
        meta={<LiveRefresh label="Notices" intervalSeconds={60} />}
      />

      <div className="page-content">
        <section className="notice-list" aria-label="Account notifications">
          {visibleNotifications.length > 0 ? (
            visibleNotifications.map((note) => (
              <Notification
                key={note.id}
                note={note}
                receipt={receiptsByNotification.get(note.id)}
                action={action}
              />
            ))
          ) : (
            <EmptyState title="You're all caught up." description="New notices will appear here." />
          )}
        </section>

        {history.length > 0 && (
          <section className="section" aria-label="Notification history">
            <div className="section__header">
              <div>
                <h2>Recent activity</h2>
              </div>
            </div>
            <DataTable columns={HISTORY_COLUMNS} caption="Past notifications" minWidth={480}>
              {history.map((receipt) => (
                <tr key={receipt.id || `${receipt.notification_id}-${receipt.occurred_at}`}>
                  <td>{RECEIPT_LABELS[receipt.status] ?? formatLabel(receipt.status)}</td>
                  <td>
                    <span className="data-table__primary">
                      {titles.get(receipt.notification_id) || "Account notice"}
                    </span>
                  </td>
                  <td>
                    <Timestamp value={receipt.occurred_at} now={now} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
        )}
      </div>
    </>
  );
}
