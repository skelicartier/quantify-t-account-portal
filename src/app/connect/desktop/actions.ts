"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import {
  AccountApiRequestError,
  approveAccountApiHandoff,
  denyAccountApiHandoff,
  type AccountApiHandoff,
} from "@/lib/admin/account-api";
import {
  desktopConnectPath,
  loginPathForDesktopConnect,
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

const GONE_STATE: DesktopConnectActionState = {
  status: "error",
  message:
    "This request has expired or was already answered. Return to Quantify Terminal and choose Sign in with browser again.",
};

const SERVICE_STATE: DesktopConnectActionState = {
  status: "error",
  message: "The connection could not be completed. Please try again.",
};

type Decision = "approve" | "deny";

/**
 * Answers the waiting app's request on the Account API. A missing or ended console
 * session goes back through sign-in and returns here; every other failure is reported in
 * place so the visitor can retry. Nothing is ever redirected to the app: it learns the
 * outcome by polling.
 */
async function decide(formData: FormData, decision: Decision): Promise<DesktopConnectActionState> {
  const handoff = parseDesktopConnectParams(formData);
  if (!handoff) return INCOMPLETE_STATE;
  const nextPath = desktopConnectPath(handoff);

  let result: AccountApiHandoff | null = null;
  let signedOut = false;
  try {
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken()?.trim();
    if (!accessToken) {
      signedOut = true;
    } else {
      const options = { idempotencyKey: randomUUID() };
      result =
        decision === "approve"
          ? await approveAccountApiHandoff(accessToken, handoff.handoff, options)
          : await denyAccountApiHandoff(accessToken, handoff.handoff, options);
    }
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      signedOut = true;
    } else if (error instanceof AccountApiRequestError && error.status === 403) {
      return REFUSED_STATE;
    } else if (
      error instanceof AccountApiRequestError &&
      (error.status === 404 || error.status === 409)
    ) {
      return GONE_STATE;
    } else {
      return SERVICE_STATE;
    }
  }

  if (signedOut || result === null) redirect(loginPathForDesktopConnect(nextPath));
  if (decision === "approve") {
    return { status: "connected", message: null, userCode: result.user_code };
  }
  return { status: "cancelled", message: null };
}

export async function connectDesktop(
  _previousState: DesktopConnectActionState,
  formData: FormData,
): Promise<DesktopConnectActionState> {
  try {
    await requireSameOriginServerAction();
  } catch {
    return SERVICE_STATE;
  }
  return decide(formData, "approve");
}

export async function cancelDesktopConnect(
  _previousState: DesktopConnectActionState,
  formData: FormData,
): Promise<DesktopConnectActionState> {
  try {
    await requireSameOriginServerAction();
  } catch {
    return SERVICE_STATE;
  }
  return decide(formData, "deny");
}
