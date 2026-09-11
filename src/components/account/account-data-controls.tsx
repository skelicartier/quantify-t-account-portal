"use client";

import { Download, RotateCcw, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, describedBy } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import {
  ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_EXPORT_CONFIRMATION,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
  type AccountLifecycleActionState,
} from "@/lib/account/lifecycle-input";
import type { AccountApiAccountLifecycle } from "@/lib/admin/account-api";
import { formatLabel, pluralize } from "@/lib/format";

type LifecycleAction = (
  state: AccountLifecycleActionState,
  data: FormData,
) => Promise<AccountLifecycleActionState>;

type Props = {
  lifecycle: AccountApiAccountLifecycle;
  requestExportAction: LifecycleAction;
  requestDeletionAction: LifecycleAction;
  cancelDeletionAction: LifecycleAction;
  now?: number | undefined;
};

const EXPORT_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "requested", label: "Requested" },
  { key: "expires", label: "Expires" },
  { key: "delivery", label: "Delivery" },
] as const;

const DELETION_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "requested", label: "Requested" },
  { key: "scheduled", label: "Scheduled for" },
] as const;

function ActionMessage({ state }: { state: AccountLifecycleActionState }) {
  if (!state.message) return null;
  return (
    <Callout
      tone={state.status === "error" ? "danger" : "success"}
      role={state.status === "error" ? "alert" : "status"}
      compact
    >
      {state.message}
    </Callout>
  );
}

function PasswordConfirmationFields({
  idPrefix,
  confirmation,
  disabled,
  state,
}: {
  idPrefix: string;
  confirmation: string;
  disabled: boolean;
  state: AccountLifecycleActionState;
}) {
  const passwordError = state.fieldErrors.currentPassword[0];
  const confirmationError = state.fieldErrors.confirmation[0];
  const confirmationHint = (
    <>
      Type <code>{confirmation}</code> to confirm.
    </>
  );
  return (
    <>
      <Field id={`${idPrefix}-password`} label="Current password" error={passwordError}>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          disabled={disabled}
          required
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy(`${idPrefix}-password`, { error: passwordError })}
        />
      </Field>
      <Field
        id={`${idPrefix}-confirmation`}
        label="Confirmation phrase"
        hint={confirmationHint}
        error={confirmationError}
      >
        <Input
          id={`${idPrefix}-confirmation`}
          name="confirmation"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          required
          invalid={Boolean(confirmationError)}
          aria-describedby={describedBy(`${idPrefix}-confirmation`, {
            hint: confirmationHint,
            error: confirmationError,
          })}
        />
      </Field>
    </>
  );
}

export function AccountDataControls({
  lifecycle,
  requestExportAction,
  requestDeletionAction,
  cancelDeletionAction,
  now,
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
  const exportLimitReached = lifecycle.exports.length >= lifecycle.export_queue.per_user_limit;
  const exportDisabled = exportPending || exportLimitReached;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Data"
        titleId="account-data-heading"
        description="Export a copy of your data, or schedule your account for deletion."
      />

      <div className="page-content">
        <Section
          id="account-export"
          title="Account export"
          eyebrow="Export"
          description={`A private, encrypted copy of your account data. Up to ${pluralize(lifecycle.export_queue.per_user_limit, "export")} can be kept at a time.`}
        >
          <form action={exportFormAction} className="form">
            <input type="hidden" name="revision" value={lifecycle.revision} />
            <div className="form-grid">
              <PasswordConfirmationFields
                idPrefix="export"
                confirmation={ACCOUNT_EXPORT_CONFIRMATION}
                disabled={exportDisabled}
                state={exportState}
              />
            </div>
            {exportLimitReached && (
              <Callout compact>
                You have reached the export limit. Wait for an export to expire before requesting
                another.
              </Callout>
            )}
            <ActionMessage state={exportState} />
            <div className="form-actions">
              <Button variant="primary" type="submit" disabled={exportDisabled}>
                <Download size={16} aria-hidden="true" />
                Request export
              </Button>
            </div>
          </form>
        </Section>

        <Section id="account-export-list" title="Exports" eyebrow="History">
          <DataTable
            columns={EXPORT_COLUMNS}
            caption="Exports"
            isEmpty={lifecycle.exports.length === 0}
            empty={
              <EmptyState
                title="No exports yet."
                description="Requested exports and their expiry will appear here."
                compact
              />
            }
          >
            {lifecycle.exports.map((item) => (
              <tr key={item.id}>
                <td>
                  <StatusPill value={item.status} />
                </td>
                <td>
                  <Timestamp value={item.requested_at} now={now} fallback="Pending" />
                </td>
                <td>
                  <Timestamp value={item.expires_at} now={now} fallback="Pending" />
                </td>
                <td>{item.download.available ? "Private descriptor ready" : "Pending"}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Section id="account-deletion" title="Controlled deletion" eyebrow="Deletion">
          <Card danger>
            {activeDeletion ? (
              <p className="card__desc">
                {`Status ${activeDeletion.status}, scheduled for deletion after `}
                <Timestamp value={activeDeletion.scheduled_delete_at} mode="absolute" />
                {`. ${activeDeletion.can_cancel ? "You can still cancel before then." : "Cancellation is no longer available."}`}
              </p>
            ) : (
              <p className="card__desc">
                Deletion is scheduled with a cooling-off period. You can cancel any time before the
                scheduled date; after that your data is removed and cannot be recovered.
              </p>
            )}
            <div className="card__body">
              {activeDeletion?.can_cancel ? (
                <form action={cancelFormAction} className="form">
                  <input type="hidden" name="revision" value={lifecycle.revision} />
                  <input type="hidden" name="requestId" value={activeDeletion.id} />
                  <div className="form-grid">
                    <PasswordConfirmationFields
                      idPrefix="cancel"
                      confirmation={ACCOUNT_DELETION_CANCEL_CONFIRMATION}
                      disabled={cancelPending}
                      state={cancelState}
                    />
                  </div>
                  <ActionMessage state={cancelState} />
                  <div className="form-actions">
                    <Button type="submit" disabled={cancelPending}>
                      <RotateCcw size={16} aria-hidden="true" />
                      Cancel deletion
                    </Button>
                  </div>
                </form>
              ) : (
                <form action={deleteFormAction} className="form">
                  <input type="hidden" name="revision" value={lifecycle.revision} />
                  <div className="form-grid">
                    <PasswordConfirmationFields
                      idPrefix="delete"
                      confirmation={ACCOUNT_DELETION_CONFIRMATION}
                      disabled={deletePending || Boolean(activeDeletion)}
                      state={deleteState}
                    />
                  </div>
                  <ActionMessage state={deleteState} />
                  <div className="form-actions">
                    <Button
                      variant="danger"
                      type="submit"
                      disabled={deletePending || Boolean(activeDeletion)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Request deletion
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>
        </Section>

        {lifecycle.deletion.requests.length > 0 && (
          <Section id="delete-history" title="Deletion history" eyebrow="History">
            <DataTable columns={DELETION_COLUMNS} caption="Deletion history">
              {lifecycle.deletion.requests.map((item) => (
                <tr key={item.id}>
                  <td>
                    <StatusPill value={item.status} label={formatLabel(item.status)} />
                  </td>
                  <td>
                    <Timestamp value={item.requested_at} now={now} fallback="Pending" />
                  </td>
                  <td>
                    <Timestamp
                      value={item.scheduled_delete_at}
                      mode="absolute"
                      fallback="Pending"
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        )}
      </div>
    </>
  );
}
