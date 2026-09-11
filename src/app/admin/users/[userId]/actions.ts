"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  ASSIGNABLE_ROLES,
  fetchAccountApiMe,
  revokeAccountApiAdminUserSession,
  ROLE_WRITE_CAPABILITY,
  setAccountApiAdminUserActive,
  setAccountApiAdminUserRole,
  USER_ACTIVATION_CAPABILITY,
  USER_SESSION_REVOKE_CAPABILITY,
  type AssignableRole,
} from "@/lib/admin/account-api";
import {
  hasAdminPortalAccess,
  hasPrivilegedRole,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/admin/access";
import { roleLabel } from "@/lib/admin/role-labels";
import type { AdminUserActivationState } from "@/lib/admin/user-activation";
import type { AdminUserRoleState } from "@/lib/admin/user-role";
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

function parseRole(value: FormDataEntryValue | null): AssignableRole | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return (ASSIGNABLE_ROLES as readonly string[]).includes(candidate)
    ? (candidate as AssignableRole)
    : null;
}

const ROLE_AUTH_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Your administrative session could not be verified. Sign in again and retry.",
};

const ROLE_CHALLENGE_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Finish signing in with your authenticator code before changing roles.",
};

const ROLE_FORBIDDEN_ERROR: AdminUserRoleState = {
  status: "error",
  message: "This administrative session cannot change that account's role.",
};

const ROLE_SERVICE_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Role changes are temporarily unavailable. Please try again.",
};

export async function updateAdminUserRole(
  _previousState: AdminUserRoleState,
  formData: FormData,
): Promise<AdminUserRoleState> {
  const userId = parseUuid(formData.get("userId"));
  const role = parseRole(formData.get("role"));
  if (!userId || !role) {
    return { status: "error", message: "Choose one of the available roles." };
  }
  if (formData.get("confirm") !== "on") {
    return { status: "error", message: "Confirm that you understand the change first." };
  }

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return ROLE_AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(ROLE_WRITE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return ROLE_FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return ROLE_CHALLENGE_ERROR;
    }

    const result = await setAccountApiAdminUserRole(accessToken, userId, role, {
      idempotencyKey: `portal-${randomUUID()}`,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/roles");
    return {
      status: "success",
      message: `Role set to ${roleLabel(result.role.effective)}.`,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That account was not found." };
      if (error.status === 409) {
        return {
          status: "error",
          message: "That change would leave the workspace without an active owner.",
        };
      }
      if (error.status === 403) return ROLE_FORBIDDEN_ERROR;
    }
    return ROLE_SERVICE_ERROR;
  }
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
