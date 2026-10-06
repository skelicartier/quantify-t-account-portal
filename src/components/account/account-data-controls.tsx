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
  DELETION_BROKER_HOLD_CODE,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
  type AccountErasureSummary,
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

/** A service note as a sentence: capitalised and full-stopped, never rewritten. */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalised = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return /[.!?]$/u.test(capitalised) ? capitalised : `${capitalised}.`;
}

type DeletionRequest = AccountApiAccountLifecycle["deletion"]["requests"][number];

/**
 * Why a deletion that is due has not happened yet, said where the person is looking.
 *
 * The deletion worker stops trading and asks every broker to cancel every working order before
 * it erases the credentials that could cancel anything; until each broker confirms, it holds
 * the erasure (status `blocked`, `hold.code` `broker_cancellation`) and checks again. A hold is
 * not a failure and costs the request none of its attempts, so it reads as waiting, not as an
 * error. Branched on the service's code, never on the wording of `last_error`.
 */
function DeletionHold({ request }: { request: DeletionRequest }) {
  const brokerHold = request.hold?.code === DELETION_BROKER_HOLD_CODE;
  if (!brokerHold && request.status !== "blocked" && request.status !== "failed") return null;
  const nextCheck = request.hold?.next_check_at || request.next_attempt_at;
  return (
    <Callout
      tone={brokerHold ? "attention" : "danger"}
      role="status"
      title={brokerHold ? "Deletion is waiting for your brokers" : "Deletion has not completed"}
    >
      {brokerHold ? (
        <p>
          Trading on your account is switched off and every working order has been asked to cancel.
          Your data is erased once each broker confirms its cancels; this is checked again
          automatically, and you can still cancel the deletion until the scheduled date.
        </p>
      ) : (
        <p>{request.last_error ? sentence(request.last_error) : "It will be tried again."}</p>
      )}
      {nextCheck && (
        <p>
          Next check <Timestamp value={nextCheck} mode="absolute" />.
        </p>
      )}
      {brokerHold && request.hold?.held_until && (
        <p>
          If a broker has still not confirmed by{" "}
          <Timestamp value={request.hold.held_until} mode="absolute" />, the erasure goes ahead
          without that confirmation.
        </p>
      )}
    </Callout>
  );
}

/** One line under a history row's status: the hold by its code, or the service's error. */
function deletionNote(item: DeletionRequest): string {
  if (item.hold?.code === DELETION_BROKER_HOLD_CODE)
    return "Waiting for brokers to confirm cancellation.";
  if ((item.status === "blocked" || item.status === "failed") && item.last_error) {
    return sentence(item.last_error);
  }
  return "";
}

/**
 * The deletion request, confirmed: when the cooling-off period ends, what is erased and what
 * is kept. The words are the Account API's, because the erasure is what makes them true.
 */
function DeletionConfirmation({
  message,
  erasure,
}: {
  message: string;
  erasure: AccountErasureSummary | undefined;
}) {
  return (
    <Callout tone="success" role="status" title="Deletion requested">
      <p>{message}</p>
      {erasure && (
        <div className="erasure">
          <h3 className="erasure__heading">What is erased</h3>
          <p>{erasure.erased}</p>
          {erasure.kept.length > 0 && (
            <>
              <h3 className="erasure__heading">What is kept</h3>
              <ul className="erasure__kept">
                {erasure.kept.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Callout>
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
          {/* Outside the forms on purpose: once the request exists the page re-renders with
              the cancel form in place of the request form, and the confirmation must stay. */}
          {deleteState.status === "success" && (
            <DeletionConfirmation message={deleteState.message} erasure={deleteState.erasure} />
          )}
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
            {activeDeletion && <DeletionHold request={activeDeletion} />}
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
                  {deleteState.status === "error" && <ActionMessage state={deleteState} />}
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
                    {deletionNote(item) && (
                      <span className="data-table__secondary">{deletionNote(item)}</span>
                    )}
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
