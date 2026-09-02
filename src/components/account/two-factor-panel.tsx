"use client";

import { useActionState } from "react";

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
    <p
      className={`account-form__status account-form__status--${state.status}`}
      role={state.status === "success" ? "status" : "alert"}
    >
      {state.message}
    </p>
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
    <form className="account-form" action={formAction} noValidate>
      <input type="hidden" name="factorId" value={factor.id} />
      <div className="field-group">
        <label htmlFor={inputId}>
          Current password, to remove {displayName(factor.friendlyName)}
        </label>
        <input
          id={inputId}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? `${inputId}-error` : undefined}
        />
        {passwordError && (
          <p className="field-error" id={`${inputId}-error`}>
            {passwordError}
          </p>
        )}
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Removing…" : "Remove authenticator"}
      </button>
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
      <div className="account-form">
        <p className="account-form__status account-form__status--error" role="alert">
          Two-factor status is temporarily unavailable, so it cannot be changed right now. Reload to
          try again. Nothing about your account has changed.
        </p>
      </div>
    );
  }

  return (
    <div className="account-form">
      <p>
        Status: <strong>{enrolled ? "Two-factor authentication is on" : "Password only"}</strong>
        {enrolled && currentLevel === "aal2" && " — this session is verified."}
      </p>

      {/* Removing the last factor empties the list, so the confirmation has to survive
          the switch out of the enrolled branch as well. */}
      {!enrolled && removeState.status === "success" && <StatusMessage state={removeState} />}

      {enrolled ? (
        <>
          <ul className="account-factor-list">
            {factors.map((factor) => (
              <li key={factor.id}>
                <span>{displayName(factor.friendlyName)}</span>
                {factor.createdAt && (
                  <span className="account-card__label">Added {factor.createdAt.slice(0, 10)}</span>
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
        <form className="account-form" action={confirmAction} noValidate>
          <input type="hidden" name="factorId" value={activeSetup.factorId ?? ""} />
          {/* Render only a real image data URI. Anything else falls back to the
              manual key below rather than emitting a broken or unexpected source.
              A plain element is deliberate: the payload is an inline data URI that
              needs no optimizer, and it must render identically without JavaScript. */}
          {activeSetup.qrCode?.startsWith("data:image/") && (
            // eslint-disable-next-line @next/next/no-img-element -- inline data URI, never remote
            <img
              className="account-totp-qr"
              src={activeSetup.qrCode}
              alt="QR code for enrolling this account in your authenticator app"
              width={200}
              height={200}
            />
          )}
          {activeSetup.secret && (
            <p className="field-help">
              Cannot scan? Enter this key manually: <code>{activeSetup.secret}</code>
            </p>
          )}
          <div className="field-group">
            <label htmlFor="security-totp-code">Authenticator code</label>
            <input
              id="security-totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`\\d{${TOTP_CODE_LENGTH}}`}
              maxLength={TOTP_CODE_LENGTH}
              required
              disabled={confirmPending}
              aria-invalid={Boolean(confirmState.fieldErrors.code[0])}
              aria-describedby={
                confirmState.fieldErrors.code[0] ? "security-totp-code-error" : undefined
              }
            />
            {confirmState.fieldErrors.code[0] && (
              <p className="field-error" id="security-totp-code-error">
                {confirmState.fieldErrors.code[0]}
              </p>
            )}
          </div>
          <StatusMessage state={confirmState} />
          <button className="button button--primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Verifying…" : "Turn on two-factor authentication"}
          </button>
        </form>
      ) : (
        /* Starting enrollment asks for the current password: verifying a factor
           raises the required level for every session of this account, so it must
           not be reachable from a session that only holds a stolen cookie. */
        <form className="account-form" action={enrollAction} noValidate>
          <div className="field-group">
            <label htmlFor="security-enroll-password">
              Current password, to set up an authenticator
            </label>
            <input
              id="security-enroll-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={enrollPending}
              aria-invalid={Boolean(enrollState.fieldErrors.currentPassword[0])}
              aria-describedby={
                enrollState.fieldErrors.currentPassword[0]
                  ? "security-enroll-password-error"
                  : undefined
              }
            />
            {enrollState.fieldErrors.currentPassword[0] && (
              <p className="field-error" id="security-enroll-password-error">
                {enrollState.fieldErrors.currentPassword[0]}
              </p>
            )}
          </div>
          {/* Only a failure is reported here. Neither the confirm state nor a pending
              enrollment's instructions belong under a "Password only" status: after an
              enroll-then-remove in one page instance both are stale. */}
          {enrollState.status === "error" && <StatusMessage state={enrollState} />}
          <button className="button button--primary" type="submit" disabled={enrollPending}>
            {enrollPending ? "Preparing…" : "Set up an authenticator app"}
          </button>
        </form>
      )}
    </div>
  );
}
