"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Timestamp } from "@/components/ui/timestamp";
import { ACCESS_TITLES } from "@/lib/account/access";
import type { AccountApiHandoff } from "@/lib/admin/account-api";
import {
  INITIAL_DESKTOP_CONNECT_STATE,
  type DesktopConnectAction,
  type DesktopConnectParams,
} from "@/lib/auth/desktop-connect";

type ConnectDesktopFormProps = {
  action: DesktopConnectAction;
  cancelAction: DesktopConnectAction;
  handoff: DesktopConnectParams;
  request: AccountApiHandoff;
  email: string;
  now?: number | undefined;
};

/**
 * The one decision on the handoff page: connect the waiting desktop app to this account.
 * The code and the device name come from the request itself so the visitor can check
 * them against what the app is showing; the handoff id travels as a hidden field and is
 * re-validated by the action.
 */
export function ConnectDesktopForm({
  action,
  cancelAction,
  handoff,
  request,
  email,
  now,
}: ConnectDesktopFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESKTOP_CONNECT_STATE);
  const [cancelState, cancelFormAction, isCancelling] = useActionState(
    cancelAction,
    INITIAL_DESKTOP_CONNECT_STATE,
  );
  const busy = isPending || isCancelling;

  if (state.status === "connected") {
    return (
      <div className="auth-form">
        <Callout tone="success" role="status" title="Connected">
          Quantify Terminal is signing you in on this computer. You can close this tab and return to
          the app.
        </Callout>
        <p className="auth__fine">
          The app showed code <span className="auth__code-inline">{state.userCode}</span>. If it is
          still waiting after a moment, choose Sign in with browser again.
        </p>
      </div>
    );
  }

  if (state.status === "access") {
    return (
      <div className="auth-form">
        <Callout
          tone={state.access === "declined" ? "danger" : "attention"}
          role="alert"
          title={ACCESS_TITLES[state.access]}
        >
          {state.message}
        </Callout>
        <p className="auth__fine">
          {state.access === "pending"
            ? "The desktop app was not connected. Once your application is approved, choose Sign in with browser in the app again."
            : "The desktop app was not connected."}
        </p>
      </div>
    );
  }

  if (cancelState.status === "cancelled") {
    return (
      <div className="auth-form">
        <Callout tone="neutral" role="status" title="Request cancelled">
          Nothing was connected. If you did not start this from Quantify Terminal, consider changing
          your password.
        </Callout>
      </div>
    );
  }

  const error =
    state.status === "error"
      ? state.message
      : cancelState.status === "error"
        ? cancelState.message
        : null;

  return (
    <div className="auth-form">
      <p className="auth__code-label">Check that Quantify Terminal shows this code</p>
      <p className="auth__code" aria-label={`Confirmation code ${request.user_code}`}>
        {request.user_code}
      </p>

      <KeyValue>
        <KeyValueRow label="Signed in as">{email}</KeyValueRow>
        <KeyValueRow label="Device">
          {request.device_name || "Quantify Terminal desktop"}
        </KeyValueRow>
        <KeyValueRow label="Requested">
          <Timestamp value={request.created_at} now={now} fallback="just now" />
        </KeyValueRow>
      </KeyValue>

      {error && (
        <Callout tone="danger" role="alert" compact>
          {error}
        </Callout>
      )}

      <form action={formAction}>
        <input type="hidden" name="handoff" value={handoff.handoff} />
        <Button type="submit" variant="primary" block disabled={busy} aria-busy={isPending}>
          {isPending ? "Connecting…" : "Connect"}
        </Button>
      </form>

      <form action={cancelFormAction}>
        <input type="hidden" name="handoff" value={handoff.handoff} />
        <Button type="submit" variant="ghost" block disabled={busy} aria-busy={isCancelling}>
          {isCancelling ? "Cancelling…" : "Cancel request"}
        </Button>
      </form>

      <p className="auth__fine">
        Only connect if you just chose Sign in with browser in Quantify Terminal and the codes
        match. The app signs in by itself; nothing is sent to this computer.
      </p>
    </div>
  );
}
