"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearRecoveryAuthorization,
  consumeRecoveryAuthorization,
} from "@/lib/auth/recovery-authorization";
import { parseResetPasswordFormData, type ResetPasswordActionState } from "@/lib/auth/recovery";
import { clearPortalSupabaseAuthCookies, createServerSupabaseClient } from "@/lib/supabase/server";

const EMPTY_FIELD_ERRORS: ResetPasswordActionState["fieldErrors"] = {
  password: [],
  passwordConfirmation: [],
};

const INVALID_RECOVERY_STATE: ResetPasswordActionState = {
  status: "error",
  message: "This recovery link is invalid or has expired. Request a new recovery email.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SERVICE_ERROR_STATE: ResetPasswordActionState = {
  status: "error",
  message: "Secure password update is temporarily unavailable. Please try again.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

export async function resetPassword(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = parseResetPasswordFormData(formData);
  if (!parsed.success) return parsed.state;

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (sessionError || !session) {
      await clearRecoveryAuthorization();
      return INVALID_RECOVERY_STATE;
    }

    const { data, error } = await supabase.auth.getUser(session.access_token);
    if (error || !data.user) {
      await clearRecoveryAuthorization();
      return INVALID_RECOVERY_STATE;
    }

    const authorized = await consumeRecoveryAuthorization({
      userId: data.user.id,
      accessToken: session.access_token,
    });
    if (!authorized) return INVALID_RECOVERY_STATE;

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) return SERVICE_ERROR_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Browser-cookie cleanup below is still mandatory and authoritative for this portal.
  }

  try {
    await clearPortalSupabaseAuthCookies();
  } catch {
    return SERVICE_ERROR_STATE;
  }

  revalidatePath("/", "layout");
  redirect("/login?notice=password-updated");
}
