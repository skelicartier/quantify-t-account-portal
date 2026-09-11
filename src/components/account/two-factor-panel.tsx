"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import {
  INITIAL_TOTP_ENROLLMENT_STATE,
  TOTP_CODE_LENGTH,
  type TotpEnrollmentState,
} from "@/lib/auth/security-input";

type TotpAction = (state: TotpEnrollmentState, formData: FormData) => Promise<TotpEnrollmentState>;

type EnrolledFactor = { id: string; friendlyName: string | null; createdAt: string | null };

type TwoFactorPanelProps = {
  factors: EnrolledFactor[];
  currentLevel: "aal1" | "aal2" | null;
  /** False when the provider's factor list could not be read for this request. */
  factorsReadable: boolean;
  startEnrollment: TotpAction;
  confirmEnrollment: TotpAction;
  removeFactor: TotpAction;
};

/**
 * Provider factor names must be unique per attempt, so enrollment appends a short
 * random suffix. That suffix is plumbing; it is stripped for display rather than shown
 * to the owner as part of their authenticator's name.
 */
const PORTAL_FACTOR_NAME = /^(Authenticator \d{4}-\d{2}-\d{2}) [0-9a-f]{8}$/u;

function displayName(friendlyName: string | null): string {
  if (!friendlyName) return "Authenticator app";
  // Only a name this portal generated is rewritten. A name chosen elsewhere is shown
  // exactly as it is, even if it happens to end in something hex-shaped.
  return friendlyName.replace(PORTAL_FACTOR_NAME, "$1");
}

function StatusMessage({ state }: { state: TotpEnrollmentState }) {
  if (!state.message) return null;
  return (
    <Callout
      tone={state.status === "success" ? "success" : "danger"}
      role={state.status === "success" ? "status" : "alert"}
      compact
    >
      {state.message}
    </Callout>
  );
}

/**
 * One removal control per factor, all sharing the panel's removal action state.
 *
 * Each form carries its own factor id, so the id submitted is always the id of the
 * factor whose button was pressed — a single form with one hidden id could only ever
 * address one of them. The *state* deliberately lives in the panel instead: a
 * successful removal revalidates the page, the removed factor leaves the attested
 * list, and a per-form state would unmount with it, taking the confirmation the owner
 * needs to see with it.
 */
function FactorRemovalForm({
  factor,
  index,
  state,
  formAction,
  pending,
}: {
  factor: EnrolledFactor;
  index: number;
  state: TotpEnrollmentState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  // Scoped to this factor: the panel-level state is shared by every removal control, so
  // an unscoped error would mark inputs the owner never submitted as invalid.
  const passwordError =
    state.factorId === factor.id ? state.fieldErrors.currentPassword[0] : undefined;
  const inputId = `security-remove-password-${index}`;

  return (
    <form className="form" action={formAction} noValidate>
      <input type="hidden" name="factorId" value={factor.id} />
      <Field
        id={inputId}
        label={`Current password, to remove ${displayName(factor.friendlyName)}`}
        error={passwordError}
      >
        <Input
          id={inputId}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy(inputId, { error: passwordError })}
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Removing…" : "Remove authenticator"}
        </Button>
      </div>
    </form>
  );
}

export function TwoFactorPanel({
  factors,
  currentLevel,
  factorsReadable,
  startEnrollment,
  confirmEnrollment,
  removeFactor,
}: TwoFactorPanelProps) {
  const [enrollState, enrollAction, enrollPending] = useActionState(
    startEnrollment,
    INITIAL_TOTP_ENROLLMENT_STATE,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmEnrollment,
    enrollState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeFactor,
    INITIAL_TOTP_ENROLLMENT_STATE,
  );

  const enrolled = factors.length > 0;
  // A pending enrollment is shown unless it is the very one already confirmed. Comparing
  // ids rather than just statuses is what lets a *new* enrollment open its setup view
  // after an earlier factor was confirmed and then removed in the same page instance.
  const activeSetup =
    enrollState.status === "pending-verification" &&
    !(confirmState.status === "success" && confirmState.factorId === enrollState.factorId)
      ? enrollState
      : null;

  // An unreadable factor list must not be shown as "Password only": that reads as a
  // statement about the account when it is a statement about this request.
  if (!factorsReadable) {
    return (
      <div className="stack">
        <Callout tone="danger" role="alert">
          Two-factor status is temporarily unavailable, so it cannot be changed right now. Reload to
          try again. Nothing about your account has changed.
        </Callout>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="inline-actions">
        <StatusPill value={enrolled ? "on" : "off"} label={enrolled ? "On" : "Off"} />
        <strong>{enrolled ? "Two-factor authentication is on" : "Password only"}</strong>
        {enrolled && currentLevel === "aal2" && (
          <span className="quiet">This session is verified.</span>
        )}
      </p>

      {/* Removing the last factor empties the list, so the confirmation has to survive
          the switch out of the enrolled branch as well. */}
      {!enrolled && removeState.status === "success" && <StatusMessage state={removeState} />}

      {enrolled ? (
        <>
          <ul className="list-rows">
            {factors.map((factor) => (
              <li className="list-row" key={factor.id}>
                <span className="list-row__main">
                  <span className="list-row__title">{displayName(factor.friendlyName)}</span>
                </span>
                {factor.createdAt && (
                  <span className="quiet">
                    Added <Timestamp value={factor.createdAt} mode="date" />
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* Enrollment revalidates this page, which switches the panel to this
              branch, so the confirmation message has to render here or it is never
              seen at all. */}
          <StatusMessage state={confirmState} />
          <StatusMessage state={removeState} />
          {factors.map((factor, index) => (
            <FactorRemovalForm
              key={factor.id}
              factor={factor}
              index={index}
              state={removeState}
              formAction={removeAction}
              pending={removePending}
            />
          ))}
        </>
      ) : activeSetup ? (
        <form className="form" action={confirmAction} noValidate>
          <input type="hidden" name="factorId" value={activeSetup.factorId ?? ""} />
          {/* Render only a real image data URI. Anything else falls back to the
              manual key below rather than emitting a broken or unexpected source.
              A plain element is deliberate: the payload is an inline data URI that
              needs no optimizer, and it must render identically without JavaScript. */}
          {activeSetup.qrCode?.startsWith("data:image/") && (
            <div className="qr-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI, never remote */}
              <img
                src={activeSetup.qrCode}
                alt="QR code for enrolling this account in your authenticator app"
                width={200}
                height={200}
              />
            </div>
          )}
          {activeSetup.secret && (
            <p className="field__hint">
              Cannot scan? Enter this key manually:{" "}
              <code className="secret">{activeSetup.secret}</code>
            </p>
          )}
          <Field
            id="security-totp-code"
            label="Authenticator code"
            error={confirmState.fieldErrors.code[0]}
          >
            <Input
              id="security-totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`\\d{${TOTP_CODE_LENGTH}}`}
              maxLength={TOTP_CODE_LENGTH}
              required
              disabled={confirmPending}
              invalid={Boolean(confirmState.fieldErrors.code[0])}
              aria-describedby={describedBy("security-totp-code", {
                error: confirmState.fieldErrors.code[0],
              })}
            />
          </Field>
          <StatusMessage state={confirmState} />
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={confirmPending}>
              {confirmPending ? "Verifying…" : "Turn on two-factor authentication"}
            </Button>
          </div>
        </form>
      ) : (
        /* Starting enrollment asks for the current password: verifying a factor
           raises the required level for every session of this account, so it must
           not be reachable from a session that only holds a stolen cookie. */
        <form className="form" action={enrollAction} noValidate>
          <Field
            id="security-enroll-password"
            label="Current password, to set up an authenticator"
            error={enrollState.fieldErrors.currentPassword[0]}
          >
            <Input
              id="security-enroll-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={enrollPending}
              invalid={Boolean(enrollState.fieldErrors.currentPassword[0])}
              aria-describedby={describedBy("security-enroll-password", {
                error: enrollState.fieldErrors.currentPassword[0],
              })}
            />
          </Field>
          {/* Only a failure is reported here. Neither the confirm state nor a pending
              enrollment's instructions belong under a "Password only" status: after an
              enroll-then-remove in one page instance both are stale. */}
          {enrollState.status === "error" && <StatusMessage state={enrollState} />}
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={enrollPending}>
              {enrollPending ? "Preparing…" : "Set up an authenticator app"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
