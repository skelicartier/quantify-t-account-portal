"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  fetchAccountApiMe,
  revokeAccountApiAdminUserSession,
  setAccountApiAdminUserActive,
  USER_ACTIVATION_CAPABILITY,
  USER_SESSION_REVOKE_CAPABILITY,
} from "@/lib/admin/account-api";
import {
  hasAdminPortalAccess,
  hasPrivilegedRole,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/admin/access";
import type { AdminUserActivationState } from "@/lib/admin/user-activation";
import type { AdminUserSessionRevocationState } from "@/lib/admin/user-session-revocation";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

const AUTH_ERROR: AdminUserActivationState = {
  status: "error",
  message: "Your administrative session could not be verified. Sign in again and retry.",
};

const CHALLENGE_ERROR: AdminUserActivationState = {
  status: "error",
  message: "Finish signing in with your authenticator code before changing user status.",
};

const FORBIDDEN_ERROR: AdminUserActivationState = {
  status: "error",
  message: "This administrative session cannot change that account.",
};

const SERVICE_ERROR: AdminUserActivationState = {
  status: "error",
  message: "User status changes are temporarily unavailable. Please try again.",
};

function parseUuid(value: FormDataEntryValue | null): string | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    candidate,
  )
    ? candidate
    : null;
}

function parseActive(value: FormDataEntryValue | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function updateAdminUserActivation(
  _previousState: AdminUserActivationState,
  formData: FormData,
): Promise<AdminUserActivationState> {
  const userId = parseUuid(formData.get("userId"));
  const isActive = parseActive(formData.get("isActive"));
  if (!userId || isActive === null) return SERVICE_ERROR;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(USER_ACTIVATION_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return CHALLENGE_ERROR;
    }

    await setAccountApiAdminUserActive(accessToken, userId, isActive, {
      idempotencyKey: `portal-${randomUUID()}`,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return {
      status: "success",
      message: isActive ? "User activated." : "User deactivated.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That account was not found." };
      if (error.status === 403 || error.status === 409) return FORBIDDEN_ERROR;
    }
    return SERVICE_ERROR;
  }
}

export async function revokeAdminUserSession(
  _previousState: AdminUserSessionRevocationState,
  formData: FormData,
): Promise<AdminUserSessionRevocationState> {
  const userId = parseUuid(formData.get("userId"));
  const sessionId = parseUuid(formData.get("sessionId"));
  if (!userId || !sessionId) return SERVICE_ERROR;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(USER_SESSION_REVOKE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return CHALLENGE_ERROR;
    }

    await revokeAccountApiAdminUserSession(accessToken, userId, sessionId, {
      idempotencyKey: `portal-${randomUUID()}`,
      reason: "admin-revoked",
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return {
      status: "success",
      message: "Session revoke recorded.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That session was not found." };
      if (error.status === 403) return FORBIDDEN_ERROR;
    }
    return SERVICE_ERROR;
  }
}
