"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  cancelAccountApiAccountDeletion,
  fetchAccountApiAccountLifecycle,
  requestAccountApiAccountDeletion,
  requestAccountApiAccountExport,
} from "@/lib/admin/account-api";
import {
  ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_EXPORT_CONFIRMATION,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
  exactConfirmation,
  singleFormValue,
  type AccountLifecycleActionState,
} from "@/lib/account/lifecycle-input";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyCurrentPassword } from "@/lib/supabase/verification-client";

const SERVICE_ERROR: AccountLifecycleActionState = {
  ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
  status: "error",
  message: "Account data controls are temporarily unavailable. Please try again.",
};

const CHALLENGE_ERROR: AccountLifecycleActionState = {
  ...SERVICE_ERROR,
  message: "Finish signing in with your authenticator code before changing account data state.",
};

const WRONG_PASSWORD_ERROR: AccountLifecycleActionState = {
  status: "error",
  message: "Check the highlighted fields and try again.",
  fieldErrors: {
    currentPassword: ["That password is not correct."],
    confirmation: [],
  },
};

function formError(message: string, confirmationMessage = ""): AccountLifecycleActionState {
  return {
    status: "error",
    message,
    fieldErrors: {
      currentPassword: [],
      confirmation: confirmationMessage ? [confirmationMessage] : [],
    },
  };
}

async function verifiedSession(): Promise<{ accessToken: string; email: string } | null> {
  const supabase = await createServerSupabaseClient();
  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] =
    await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
  const email = userData.user?.email?.trim().toLowerCase();
  const accessToken = sessionData.session?.access_token?.trim();
  if (userError || sessionError || !email || !accessToken) return null;
  return { accessToken, email };
}

async function authorizedLifecycleMutation(formData: FormData, expectedConfirmation: string) {
  const currentPassword = singleFormValue(formData, "currentPassword");
  const confirmation = singleFormValue(formData, "confirmation");
  const revision = singleFormValue(formData, "revision", { allowEmpty: true });
  if (!currentPassword) {
    return {
      ok: false as const,
      state: formError("Check the highlighted fields and try again."),
    };
  }
  if (!exactConfirmation(confirmation, expectedConfirmation)) {
    return {
      ok: false as const,
      state: formError(
        "Check the highlighted fields and try again.",
        `Type ${expectedConfirmation} exactly.`,
      ),
    };
  }
  if (revision === null) {
    return {
      ok: false as const,
      state: formError("Refresh this page and try again."),
    };
  }

  const { decision } = await requireMutationAssurance();
  if (decision === "challenge-required") return { ok: false as const, state: CHALLENGE_ERROR };
  if (decision !== "satisfied") return { ok: false as const, state: SERVICE_ERROR };

  const session = await verifiedSession();
  if (!session) return { ok: false as const, state: SERVICE_ERROR };

  const verification = await verifyCurrentPassword(session.email, currentPassword);
  if (verification === "rejected") return { ok: false as const, state: WRONG_PASSWORD_ERROR };
  if (verification !== "verified") return { ok: false as const, state: SERVICE_ERROR };

  const lifecycle = await fetchAccountApiAccountLifecycle(session.accessToken);
  if (lifecycle.revision !== revision) {
    return { ok: false as const, state: formError("This page changed. Reload and try again.") };
  }
  return { ok: true as const, session, lifecycle, revision, confirmation: confirmation ?? "" };
}

function mapAccountApiError(error: unknown): AccountLifecycleActionState {
  if (error instanceof AccountApiRequestError) {
    if (error.code === "revision_conflict") {
      return formError("This page changed. Reload and try again.");
    }
    if (error.code === "quota_exceeded") {
      return formError("This queue is full right now. Try again later.");
    }
    if (error.code === "account_deletion_pending") {
      return formError("A deletion request is already pending for this account.");
    }
    if (error.code === "account_deletion_not_pending") {
      return formError("There is no cancellable deletion request for this account.");
    }
    if (error.code === "legal_hold_active") {
      return formError("This account is under a legal hold, so deletion cannot continue.");
    }
  }
  return SERVICE_ERROR;
}

export async function requestAccountExport(
  _previousState: AccountLifecycleActionState,
  formData: FormData,
): Promise<AccountLifecycleActionState> {
  try {
    await requireSameOriginServerAction();
    const authorized = await authorizedLifecycleMutation(formData, ACCOUNT_EXPORT_CONFIRMATION);
    if (!authorized.ok) return authorized.state;
    await requestAccountApiAccountExport(
      authorized.session.accessToken,
      {
        expected_revision: authorized.revision,
        format: "json",
        confirmation: authorized.confirmation,
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/data");
    return {
      ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
      status: "success",
      message:
        "Export request queued. A private encrypted download descriptor will appear here when it is ready.",
    };
  } catch (error) {
    if (error instanceof AccountApiUnavailableError) return SERVICE_ERROR;
    return mapAccountApiError(error);
  }
}

export async function requestAccountDeletion(
  _previousState: AccountLifecycleActionState,
  formData: FormData,
): Promise<AccountLifecycleActionState> {
  try {
    await requireSameOriginServerAction();
    const authorized = await authorizedLifecycleMutation(formData, ACCOUNT_DELETION_CONFIRMATION);
    if (!authorized.ok) return authorized.state;
    await requestAccountApiAccountDeletion(
      authorized.session.accessToken,
      {
        expected_revision: authorized.revision,
        confirmation: authorized.confirmation,
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/data");
    return {
      ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
      status: "success",
      message:
        "Deletion request created. The cooling-off window is active and can be cancelled here before it ends.",
    };
  } catch (error) {
    if (error instanceof AccountApiUnavailableError) return SERVICE_ERROR;
    return mapAccountApiError(error);
  }
}

export async function cancelAccountDeletion(
  _previousState: AccountLifecycleActionState,
  formData: FormData,
): Promise<AccountLifecycleActionState> {
  try {
    await requireSameOriginServerAction();
    const authorized = await authorizedLifecycleMutation(
      formData,
      ACCOUNT_DELETION_CANCEL_CONFIRMATION,
    );
    if (!authorized.ok) return authorized.state;
    const requestId = singleFormValue(formData, "requestId");
    if (!requestId) return formError("There is no cancellable deletion request for this account.");
    await cancelAccountApiAccountDeletion(
      authorized.session.accessToken,
      {
        expected_revision: authorized.revision,
        request_id: requestId,
        confirmation: authorized.confirmation,
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/data");
    return {
      ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
      status: "success",
      message: "Deletion request cancelled.",
    };
  } catch (error) {
    if (error instanceof AccountApiUnavailableError) return SERVICE_ERROR;
    return mapAccountApiError(error);
  }
}
