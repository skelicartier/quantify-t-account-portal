"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";

import { formatAdminNumber } from "@/components/admin/admin-format";
import type { AccountApiAdminNotificationEmailQueue } from "@/lib/admin/account-api";
import {
  INITIAL_NOTIFICATION_EMAIL_STATE,
  type NotificationEmailActionState,
  type NotificationEmailInput,
} from "@/lib/notifications/email-input";

type Props = {
  queue: AccountApiAdminNotificationEmailQueue;
  action: (
    state: NotificationEmailActionState,
    data: FormData,
  ) => Promise<NotificationEmailActionState>;
};

const blank: NotificationEmailInput = {
  subject: "",
  body: "",
  scheduled_at: "",
  target: { mode: "all", user_ids: [], emails: [] },
};

function dateValue(value: string): string {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : "";
}

function recipientLabel(target: AccountApiAdminNotificationEmailQueue["jobs"][number]["target"]) {
  if (target.mode === "all") return "All accounts";
  if (target.mode === "active") return "Active accounts";
  return `Selected (${formatAdminNumber(target.user_ids.length + target.emails.length)})`;
}

function statusDetail(job: AccountApiAdminNotificationEmailQueue["jobs"][number]) {
  if (job.status === "sent") return job.completed_at || "Completed";
  if (job.status === "dead") return job.last_error || "Dead-lettered";
  if (job.status === "retry") return job.next_attempt_at || "Retry pending";
  return job.next_attempt_at || "Queued";
}

export function AdminEmailManager({ queue, action }: Props) {
  const [email, setEmail] = useState(blank);
  const [userIds, setUserIds] = useState("");
  const [emails, setEmails] = useState("");
  const [state, formAction, pending] = useActionState(action, INITIAL_NOTIFICATION_EMAIL_STATE);
  const selectors = (value: string) => [...new Set(value.split(/[\s,;]+/u).filter(Boolean))];
  const set = <K extends keyof NotificationEmailInput>(key: K, value: NotificationEmailInput[K]) =>
    setEmail((current) => ({ ...current, [key]: value }));
  const payload = {
    ...email,
    target: {
      mode: email.target.mode,
      user_ids: email.target.mode === "selected" ? selectors(userIds) : [],
      emails: email.target.mode === "selected" ? selectors(emails) : [],
    },
  };
  const quotaFull =
    queue.jobs.length >= queue.quota.queue_limit ||
    queue.quota.queued_24h >= queue.quota.daily_limit;

  return (
    <>
      <form action={formAction} className="notification-editor">
        <input type="hidden" name="revision" value={queue.revision} />
        <input type="hidden" name="email" value={JSON.stringify(payload)} />
        <fieldset disabled={pending || quotaFull}>
          <div className="notification-fields">
            <label className="notification-field notification-field--wide">
              Subject
              <input
                required
                maxLength={140}
                value={email.subject}
                onChange={(event) => set("subject", event.target.value)}
              />
            </label>
            <label className="notification-field notification-field--wide">
              Body
              <textarea
                required
                rows={6}
                maxLength={4000}
                value={email.body}
                onChange={(event) => set("body", event.target.value)}
              />
            </label>
            <label className="notification-field">
              Recipients
              <select
                value={email.target.mode}
                onChange={(event) =>
                  set("target", {
                    ...email.target,
                    mode: event.target.value as NotificationEmailInput["target"]["mode"],
                  })
                }
              >
                <option value="all">All accounts</option>
                <option value="active">Active accounts</option>
                <option value="selected">Selected accounts</option>
              </select>
            </label>
            <label className="notification-field">
              Schedule (UTC)
              <input
                type="datetime-local"
                value={dateValue(email.scheduled_at)}
                onChange={(event) =>
                  set("scheduled_at", event.target.value ? `${event.target.value}:00Z` : "")
                }
              />
            </label>
            {email.target.mode === "selected" && (
              <>
                <label className="notification-field">
                  Account IDs
                  <textarea
                    rows={3}
                    maxLength={190000}
                    value={userIds}
                    onChange={(event) => setUserIds(event.target.value)}
                  />
                </label>
                <label className="notification-field">
                  Email addresses
                  <textarea
                    rows={3}
                    maxLength={190000}
                    value={emails}
                    onChange={(event) => setEmails(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <div className="notification-toolbar">
            <button className="button button--primary" type="submit">
              <Send size={16} aria-hidden="true" />
              {pending ? "Queueing" : "Queue email"}
            </button>
          </div>
        </fieldset>
        {quotaFull && <p role="status">Email queue quota reached.</p>}
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
        )}
      </form>

      {queue.jobs.length === 0 ? (
        <p className="admin-empty-state">No email jobs queued.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Scheduled</th>
                <th>Next / final</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {queue.jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="admin-row-title">{job.subject}</span>
                    <span className="account-id">{job.id}</span>
                  </td>
                  <td>{job.status}</td>
                  <td>{recipientLabel(job.target)}</td>
                  <td>{job.scheduled_at || "Immediate"}</td>
                  <td>{statusDetail(job)}</td>
                  <td>
                    {formatAdminNumber(job.attempts)} / {formatAdminNumber(job.max_attempts)}
                  </td>
                  <td>{job.last_error || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
