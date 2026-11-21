import {
  beginPasskeyRegistration,
  beginPasskeyVerification,
  finishPasskeyRegistration,
  finishPasskeyVerification,
  removePasskey as removePasskeyAction,
} from "@/app/account/security/passkey-actions";
import { PasskeyBrowserError, createPasskey, getPasskey } from "@/lib/passkeys/browser";
import type { PasskeyStepResult } from "@/lib/passkeys/state";

/**
 * A whole passkey ceremony, start to finish, from the browser: ask the service for a
 * challenge, hand it to the device, hand the device's answer back. Each answers one
 * result a component can show as it stands.
 */

const DONE: PasskeyStepResult = { status: "ok", value: null };

function fromBrowser(error: unknown): PasskeyStepResult {
  if (error instanceof PasskeyBrowserError) {
    return { status: "error", reason: "refused", message: error.message };
  }
  return {
    status: "error",
    reason: "unavailable",
    message: "Passkeys are temporarily unavailable. Please try again.",
  };
}

/** Prove a passkey this account already has. On success the session is confirmed. */
export async function provePasskey(): Promise<PasskeyStepResult> {
  try {
    const options = await beginPasskeyVerification();
    if (options.status !== "ok") return options;
    const credential = await getPasskey(options.value);
    return await finishPasskeyVerification(credential);
  } catch (error) {
    return fromBrowser(error);
  }
}

/**
 * Add a passkey made on this device. An account that already has one must have proved
 * it recently; when the service says so, the existing one is asked for and the step is
 * tried once more, so the person sees two prompts instead of an error to decode.
 */
export async function addPasskey(input: {
  password: string;
  name: string;
}): Promise<PasskeyStepResult> {
  try {
    let options = await beginPasskeyRegistration(input.password);
    if (options.status === "error" && options.reason === "needs-passkey") {
      const proved = await provePasskey();
      if (proved.status !== "ok") return proved;
      options = await beginPasskeyRegistration(input.password);
    }
    if (options.status !== "ok") return options;
    const credential = await createPasskey(options.value);
    return await finishPasskeyRegistration(input.name, credential);
  } catch (error) {
    return fromBrowser(error);
  }
}

/** Remove one passkey, asking for a recent proof first when the service wants one. */
export async function removePasskey(passkeyId: string): Promise<PasskeyStepResult> {
  try {
    let removed = await removePasskeyAction(passkeyId);
    if (removed.status === "error" && removed.reason === "needs-passkey") {
      const proved = await provePasskey();
      if (proved.status !== "ok") return proved;
      removed = await removePasskeyAction(passkeyId);
    }
    return removed.status === "ok" ? DONE : removed;
  } catch (error) {
    return fromBrowser(error);
  }
}
