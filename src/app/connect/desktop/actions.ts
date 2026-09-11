"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { AccountApiRequestError, startAccountApiHandoff } from "@/lib/admin/account-api";
import {
  desktopConnectPath,
  loginPathForDesktopConnect,
  loopbackCallbackUrl,
  parseDesktopConnectParams,
  type DesktopConnectActionState,
} from "@/lib/auth/desktop-connect";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

const INCOMPLETE_STATE: DesktopConnectActionState = {
  status: "error",
  message:
    "This connection request is incomplete. Return to Quantify Terminal and choose Sign in with browser again.",
};

const REFUSED_STATE: DesktopConnectActionState = {
  status: "error",
  message: "This account can't connect the desktop app right now.",
};

const SERVICE_STATE: DesktopConnectActionState = {
  status: "error",
  message: "The connection could not be started. Please try again.",
};

/**
 * Mints the one-time code for the desktop app and sends the browser to the app's
 * loopback listener. A missing or ended console session goes back through sign-in and
 * returns here; every other failure is reported in place so the visitor can retry.
 */
export async function connectDesktop(
  _previousState: DesktopConnectActionState,
  formData: FormData,
): Promise<DesktopConnectActionState> {
  const handoff = parseDesktopConnectParams(formData);
  if (!handoff) return INCOMPLETE_STATE;
  const nextPath = desktopConnectPath(handoff);

  let code: string | null = null;
  let signedOut = false;
  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken()?.trim();
    if (!accessToken) {
      signedOut = true;
    } else {
      const started = await startAccountApiHandoff(
        accessToken,
        { challenge: handoff.challenge },
        { idempotencyKey: randomUUID() },
      );
      code = started.code;
    }
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      signedOut = true;
    } else if (error instanceof AccountApiRequestError && error.status === 403) {
      return REFUSED_STATE;
    } else {
      return SERVICE_STATE;
    }
  }

  if (signedOut || code === null) redirect(loginPathForDesktopConnect(nextPath));
  redirect(loopbackCallbackUrl(handoff.port, code, handoff.state));
}
