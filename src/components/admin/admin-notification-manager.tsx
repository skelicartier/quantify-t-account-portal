"use client";

import { useActionState, useState } from "react";
import { Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import type { AccountApiAdminNotifications } from "@/lib/admin/account-api";
import {
  INITIAL_NOTIFICATION_STATE,
  type NotificationActionState,
  type NotificationInput,
} from "@/lib/notifications/input";

type Props = {
  document: AccountApiAdminNotifications;
  evaluatedAt?: number;
  action: (state: NotificationActionState, data: FormData) => Promise<NotificationActionState>;
};

const blank: NotificationInput = {
  id: "",
  title: "",
  body: "",
  severity: "info",
  display: "center",
  active: true,
  dismissible: true,
  starts_at: "",
  expires_at: "",
  actions: [],
  target: { mode: "all", user_ids: [], emails: [] },
};

function editable(note: AccountApiAdminNotifications["notifications"][number]): NotificationInput {
  const {
    id,
    title,
    body,
    severity,
    display,
    active,
    dismissible,
    starts_at,
    expires_at,
    target,
    actions,
  } = note;
  const input = {
    id,
    title,
    body,
    severity,
    display,
    active,
    dismissible,
    starts_at,
    expires_at,
    target,
    actions,
  };
  return {
    ...input,
    actions: input.actions.map((item) => ({
      ...item,
      kind: item.kind === "update" || item.kind === "dismiss" ? item.kind : "link",
    })),
  };
}

function dateValue(value: string): string {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : "";
}

function NotificationEditor({
  initial,
  revision,
  action,
  onClose,
}: {
  initial: NotificationInput;
  revision: string;
  action: Props["action"];
  onClose: () => void;
}) {
  const [note, setNote] = useState(initial);
  const [userIds, setUserIds] = useState(initial.target.user_ids.join("\n"));
  const [emails, setEmails] = useState(initial.target.emails.join("\n"));
  const [state, formAction, pending] = useActionState(action, INITIAL_NOTIFICATION_STATE);
  const set = <K extends keyof NotificationInput>(key: K, value: NotificationInput[K]) =>
    setNote((current) => ({ ...current, [key]: value }));
  const selectors = (value: string) => [...new Set(value.split(/[\s,;]+/u).filter(Boolean))];
  const payload = {
    ...note,
    target: {
      mode: note.target.mode,
      user_ids: note.target.mode === "selected" ? selectors(userIds) : [],
      emails: note.target.mode === "selected" ? selectors(emails) : [],
    },
  };

  return (
    <form action={formAction} className="notification-editor">
      <div className="admin-section__heading">
        <h2>{note.id ? "Edit notification" : "New notification"}</h2>
        <button
          type="button"
          className="button notification-icon"
          title="Close editor"
          aria-label="Close editor"
          onClick={onClose}
          disabled={pending}
        >
          <X size={18} />
        </button>
      </div>
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="notification" value={JSON.stringify(payload)} />
      <fieldset disabled={pending}>
        <div className="notification-fields">
          <label className="notification-field notification-field--wide">
            Title
            <input
              maxLength={140}
              value={note.title}
              onChange={(event) => set("title", event.target.value)}
            />
          </label>
          <label className="notification-field notification-field--wide">
            Message
            <textarea
              rows={5}
              maxLength={4000}
              value={note.body}
              onChange={(event) => set("body", event.target.value)}
            />
          </label>
          <label className="notification-field">
            Severity
            <select
              value={note.severity}
              onChange={(event) =>
                set("severity", event.target.value as NotificationInput["severity"])
              }
            >
              {["info", "success", "warning", "critical"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="notification-field">
            Display
            <select
              value={note.display}
              onChange={(event) =>
                set("display", event.target.value as NotificationInput["display"])
              }
            >
              <option value="center">Notification center</option>
              <option value="popup">Popup</option>
            </select>
          </label>
          <label className="notification-field">
            Starts (UTC)
            <input
              type="datetime-local"
              value={dateValue(note.starts_at)}
              onChange={(event) =>
                set("starts_at", event.target.value ? `${event.target.value}:00Z` : "")
              }
            />
          </label>
          <label className="notification-field">
            Expires (UTC)
            <input
              type="datetime-local"
              value={dateValue(note.expires_at)}
              onChange={(event) =>
                set("expires_at", event.target.value ? `${event.target.value}:00Z` : "")
              }
            />
          </label>
          <label className="notification-field notification-field--wide">
            Recipients
            <select
              value={note.target.mode}
              onChange={(event) =>
                set("target", {
                  ...note.target,
                  mode: event.target.value as NotificationInput["target"]["mode"],
                })
              }
            >
              <option value="all">All accounts</option>
              <option value="active">Active accounts</option>
              <option value="selected">Selected accounts</option>
            </select>
          </label>
          {note.target.mode === "selected" && (
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
          <label>
            <input
              type="checkbox"
              checked={note.active}
              onChange={(event) => set("active", event.target.checked)}
            />{" "}
            Active
          </label>
          <label>
            <input
              type="checkbox"
              checked={note.dismissible}
              onChange={(event) => set("dismissible", event.target.checked)}
            />{" "}
            Dismissible
          </label>
        </div>
        <div className="admin-section__heading">
          <h3>Actions</h3>
          <button
            className="button notification-icon"
            type="button"
            title="Add action"
            aria-label="Add action"
            disabled={note.actions.length >= 4}
            onClick={() =>
              set("actions", [
                ...note.actions,
                { kind: "link", label: "", url: "", primary: false },
              ])
            }
          >
            <Plus size={18} />
          </button>
        </div>
        {note.actions.map((item, index) => {
          const update = (patch: Partial<NotificationInput["actions"][number]>) =>
            set(
              "actions",
              note.actions.map((current, position) =>
                position === index ? { ...current, ...patch } : current,
              ),
            );
          return (
            <div className="notification-action-row" key={index}>
              <label className="notification-field">
                Label
                <input
                  required
                  maxLength={60}
                  value={item.label}
                  onChange={(event) => update({ label: event.target.value })}
                />
              </label>
              <label className="notification-field">
                Type
                <select
                  value={item.kind}
                  onChange={(event) => update({ kind: event.target.value as typeof item.kind })}
                >
                  <option value="link">Link</option>
                  <option value="update">Update</option>
                  <option value="dismiss">Dismiss</option>
                </select>
              </label>
              {item.kind !== "dismiss" && (
                <label className="notification-field">
                  HTTPS URL
                  <input
                    type="url"
                    required
                    maxLength={500}
                    value={item.url}
                    onChange={(event) => update({ url: event.target.value })}
                  />
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={item.primary}
                  onChange={(event) => update({ primary: event.target.checked })}
                />{" "}
                Primary
              </label>
              <button
                type="button"
                className="button notification-icon"
                title="Remove action"
                aria-label={`Remove action ${index + 1}`}
                onClick={() =>
                  set(
                    "actions",
                    note.actions.filter((_, position) => index !== position),
                  )
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
        <div className="notification-toolbar">
          <button className="button button--primary" type="submit">
            <Save size={16} aria-hidden="true" />
            {pending ? "Saving" : "Save notification"}
          </button>
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </fieldset>
      {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    </form>
  );
}

export function AdminNotificationManager({ document, action, evaluatedAt }: Props) {
  const [selection, setSelection] = useState<{
    note: NotificationInput;
    revision: string;
    key: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const open = (note: NotificationInput) =>
    setSelection((previous) => ({
      note,
      revision: document.revision,
      key: (previous?.key ?? 0) + 1,
    }));
  const save: Props["action"] = async (state, data) => {
    const result = await action(state, data);
    if (result.status === "success") {
      setSelection(null);
      setMessage(result.message);
    }
    return result;
  };
  const status = (note: NotificationInput) => {
    if (!note.active) return "Paused";
    if (evaluatedAt === undefined) return "Enabled";
    if (note.expires_at && Date.parse(note.expires_at) < evaluatedAt) return "Expired";
    if (note.starts_at && Date.parse(note.starts_at) > evaluatedAt) return "Scheduled";
    return "Active";
  };
  return (
    <>
      <div className="notification-toolbar">
        <button className="button button--primary" onClick={() => open(blank)}>
          <Plus size={16} aria-hidden="true" /> New notification
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {selection && (
        <NotificationEditor
          key={selection.key}
          initial={selection.note}
          revision={selection.revision}
          action={save}
          onClose={() => setSelection(null)}
        />
      )}
      {document.notifications.length === 0 ? (
        <p className="admin-empty-state">No notifications yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Starts (UTC)</th>
                <th>Expires (UTC)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {document.notifications.map((note) => (
                <tr key={note.id}>
                  <td>
                    <span className="admin-row-title">{note.title || "Untitled"}</span>
                    <span className="account-id">{note.severity}</span>
                  </td>
                  <td>{status(editable(note))}</td>
                  <td>
                    {note.target.mode === "selected"
                      ? `Selected (${note.target.user_ids.length + note.target.emails.length})`
                      : note.target.mode === "all"
                        ? "All accounts"
                        : "Active accounts"}
                  </td>
                  <td>{note.starts_at || "Immediate"}</td>
                  <td>{note.expires_at || "None"}</td>
                  <td>
                    <div className="notification-toolbar">
                      <button
                        className="button notification-icon"
                        title="Edit notification"
                        aria-label={`Edit ${note.title || "notification"}`}
                        onClick={() => open(editable(note))}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="button notification-icon"
                        title="Duplicate notification"
                        aria-label={`Duplicate ${note.title || "notification"}`}
                        onClick={() => open({ ...editable(note), id: "", active: false })}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
