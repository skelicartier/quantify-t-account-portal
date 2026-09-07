"use client";

import { useActionState, useMemo, useTransition } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import type { AccountApiNotificationState, AccountApiNotifications } from "@/lib/admin/account-api";
import {
  INITIAL_NOTIFICATION_STATE,
  safeNotificationHref,
  type NotificationActionState,
} from "@/lib/notifications/input";

type Props = {
  notifications: AccountApiNotifications["notifications"];
  receiptState?: Pick<AccountApiNotificationState, "state" | "receipts">;
  action: (state: NotificationActionState, data: FormData) => Promise<NotificationActionState>;
};

function formatReceiptTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(".000Z", "Z").replace("T", " ");
}

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
  return (
    <article className={`account-notification account-notification--${note.severity}`}>
      <p className="account-card__label">
        {note.severity}
        {receipt ? ` / ${receipt.status}` : ""}
      </p>
      <h2>{note.title || "Account notice"}</h2>
      <p className="notification-body">{note.body}</p>
      <form action={formAction}>
        <input type="hidden" name="notificationId" value={note.id} />
        <div className="notification-toolbar">
          {note.actions.map((item, index) => {
            if (item.kind === "dismiss")
              return note.dismissible ? (
                <button
                  key={index}
                  className="button"
                  name="status"
                  value="dismissed"
                  disabled={pending}
                >
                  {item.label}
                </button>
              ) : null;
            const href = safeNotificationHref(item.url);
            return href ? (
              <a
                key={index}
                className={`button${item.primary ? " button--primary" : ""}`}
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
          <button className="button" name="status" value="read" disabled={pending}>
            <Check size={16} aria-hidden="true" />
            Mark read
          </button>
          {note.dismissible && (
            <button
              className="button notification-icon"
              name="status"
              value="dismissed"
              title="Dismiss notification"
              aria-label={`Dismiss ${note.title || "notification"}`}
              disabled={pending}
            >
              <X size={16} />
            </button>
          )}
        </div>
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
        )}
      </form>
    </article>
  );
}

export function AccountNotifications({ notifications, receiptState, action }: Props) {
  const receiptsByNotification = useMemo(
    () => new Map((receiptState?.state ?? []).map((item) => [item.notification_id, item])),
    [receiptState],
  );
  const visibleNotifications = notifications.filter(
    (note) => receiptsByNotification.get(note.id)?.status !== "dismissed",
  );
  const titles = new Map(notifications.map((note) => [note.id, note.title || "Account notice"]));
  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading">
        <p className="eyebrow">Cloud account</p>
        <h1>Notifications</h1>
      </section>
      <section className="account-notification-list" aria-label="Account notifications">
        {visibleNotifications.length ? (
          visibleNotifications.map((note) => (
            <Notification
              key={note.id}
              note={note}
              receipt={receiptsByNotification.get(note.id)}
              action={action}
            />
          ))
        ) : (
          <p className="account-empty-state">No notifications.</p>
        )}
      </section>
      {(receiptState?.receipts.length ?? 0) > 0 && (
        <section className="notification-history" aria-label="Notification history">
          <h2>Recent history</h2>
          <ul>
            {receiptState?.receipts.slice(0, 12).map((receipt) => (
              <li key={receipt.id || `${receipt.notification_id}-${receipt.occurred_at}`}>
                <span>{receipt.status}</span>
                <span>{titles.get(receipt.notification_id) || receipt.notification_id}</span>
                <time dateTime={receipt.occurred_at}>{formatReceiptTime(receipt.occurred_at)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
