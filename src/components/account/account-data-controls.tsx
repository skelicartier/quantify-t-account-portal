"use client";

import { useActionState } from "react";
import { Download, RotateCcw, Trash2 } from "lucide-react";

import {
  ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_EXPORT_CONFIRMATION,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
  type AccountLifecycleActionState,
} from "@/lib/account/lifecycle-input";
import type { AccountApiAccountLifecycle } from "@/lib/admin/account-api";

type LifecycleAction = (
  state: AccountLifecycleActionState,
  data: FormData,
) => Promise<AccountLifecycleActionState>;

type Props = {
  lifecycle: AccountApiAccountLifecycle;
  requestExportAction: LifecycleAction;
  requestDeletionAction: LifecycleAction;
  cancelDeletionAction: LifecycleAction;
};

function formatTime(value: string) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(".000Z", "Z").replace("T", " ");
}

function ActionMessage({ state }: { state: AccountLifecycleActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function PasswordConfirmationFields({
  confirmation,
  disabled,
  state,
}: {
  confirmation: string;
  disabled: boolean;
  state: AccountLifecycleActionState;
}) {
  return (
    <>
      <label>
        <span>Current password</span>
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          disabled={disabled}
          required
        />
      </label>
      {state.fieldErrors.currentPassword.map((error) => (
        <p className="form-error" key={error}>
          {error}
        </p>
      ))}
      <label>
        <span>
          Confirmation <code>{confirmation}</code>
        </span>
        <input name="confirmation" disabled={disabled} required />
      </label>
      {state.fieldErrors.confirmation.map((error) => (
        <p className="form-error" key={error}>
          {error}
        </p>
      ))}
    </>
  );
}

export function AccountDataControls({
  lifecycle,
  requestExportAction,
  requestDeletionAction,
  cancelDeletionAction,
}: Props) {
  const [exportState, exportFormAction, exportPending] = useActionState(
    requestExportAction,
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    requestDeletionAction,
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelDeletionAction,
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
  );
  const activeDeletion = lifecycle.deletion.active;
  const exportDisabled =
    exportPending || lifecycle.exports.length >= lifecycle.export_queue.per_user_limit;

  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading">
        <p className="eyebrow">Cloud account</p>
        <h1>Data</h1>
      </section>

      <section className="account-form-panel" aria-labelledby="account-export-heading">
        <div>
          <p className="account-card__label">Export</p>
          <h2 id="account-export-heading">Account export</h2>
        </div>
        <form action={exportFormAction} className="account-data-form">
          <input type="hidden" name="revision" value={lifecycle.revision} />
          <PasswordConfirmationFields
            confirmation={ACCOUNT_EXPORT_CONFIRMATION}
            disabled={exportDisabled}
            state={exportState}
          />
          <button className="button button--primary" disabled={exportDisabled}>
            <Download size={16} aria-hidden="true" />
            Request export
          </button>
          <ActionMessage state={exportState} />
        </form>
      </section>

      <section className="account-data-section" aria-labelledby="account-export-list-heading">
        <h2 id="account-export-list-heading">Exports</h2>
        {lifecycle.exports.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Expires</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {lifecycle.exports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.status}</td>
                    <td>{formatTime(item.requested_at)}</td>
                    <td>{formatTime(item.expires_at)}</td>
                    <td>{item.download.available ? "Private descriptor ready" : "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="account-empty-state">No exports.</p>
        )}
      </section>

      <section
        className="account-form-panel account-form-panel--danger"
        aria-labelledby="delete-heading"
      >
        <div>
          <p className="account-card__label">Deletion</p>
          <h2 id="delete-heading">Controlled deletion</h2>
          {activeDeletion && (
            <p>
              Status {activeDeletion.status}; scheduled after{" "}
              <time dateTime={activeDeletion.scheduled_delete_at}>
                {formatTime(activeDeletion.scheduled_delete_at)}
              </time>
              .
            </p>
          )}
        </div>
        {activeDeletion?.can_cancel ? (
          <form action={cancelFormAction} className="account-data-form">
            <input type="hidden" name="revision" value={lifecycle.revision} />
            <input type="hidden" name="requestId" value={activeDeletion.id} />
            <PasswordConfirmationFields
              confirmation={ACCOUNT_DELETION_CANCEL_CONFIRMATION}
              disabled={cancelPending}
              state={cancelState}
            />
            <button className="button" disabled={cancelPending}>
              <RotateCcw size={16} aria-hidden="true" />
              Cancel deletion
            </button>
            <ActionMessage state={cancelState} />
          </form>
        ) : (
          <form action={deleteFormAction} className="account-data-form">
            <input type="hidden" name="revision" value={lifecycle.revision} />
            <PasswordConfirmationFields
              confirmation={ACCOUNT_DELETION_CONFIRMATION}
              disabled={deletePending || Boolean(activeDeletion)}
              state={deleteState}
            />
            <button
              className="button button--danger"
              disabled={deletePending || Boolean(activeDeletion)}
            >
              <Trash2 size={16} aria-hidden="true" />
              Request deletion
            </button>
            <ActionMessage state={deleteState} />
          </form>
        )}
      </section>

      {lifecycle.deletion.requests.length > 0 && (
        <section className="account-data-section" aria-labelledby="delete-history-heading">
          <h2 id="delete-history-heading">Deletion history</h2>
          <ul className="account-data-list">
            {lifecycle.deletion.requests.map((item) => (
              <li key={item.id}>
                <span>{item.status}</span>
                <time dateTime={item.requested_at}>{formatTime(item.requested_at)}</time>
                <time dateTime={item.scheduled_delete_at}>
                  {formatTime(item.scheduled_delete_at)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
