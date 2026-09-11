"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import {
  INITIAL_DESKTOP_CONNECT_STATE,
  type DesktopConnectAction,
  type DesktopConnectParams,
} from "@/lib/auth/desktop-connect";

type ConnectDesktopFormProps = {
  action: DesktopConnectAction;
  handoff: DesktopConnectParams;
  email: string;
};

/**
 * The one decision on the handoff page: connect the waiting desktop app to this account.
 * The handoff parameters travel as hidden fields and are re-validated by the action.
 */
export function ConnectDesktopForm({ action, handoff, email }: ConnectDesktopFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESKTOP_CONNECT_STATE);

  return (
    <form className="auth-form" action={formAction}>
      <input type="hidden" name="state" value={handoff.state} />
      <input type="hidden" name="port" value={handoff.port} />
      <input type="hidden" name="challenge" value={handoff.challenge} />

      <KeyValue>
        <KeyValueRow label="Signed in as">{email}</KeyValueRow>
        <KeyValueRow label="Returns to" mono>
          127.0.0.1:{handoff.port}
        </KeyValueRow>
      </KeyValue>

      {state.status === "error" && (
        <Callout tone="danger" role="alert" compact>
          {state.message}
        </Callout>
      )}

      <Button type="submit" variant="primary" block disabled={isPending} aria-busy={isPending}>
        {isPending ? "Connecting…" : "Connect"}
      </Button>

      <p className="auth__fine">
        Only continue if you just chose Sign in with browser in Quantify Terminal on this computer.
        You&apos;ll be returned to the app automatically.
      </p>
    </form>
  );
}
