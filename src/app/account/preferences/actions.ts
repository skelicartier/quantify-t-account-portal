"use server";

import { revalidatePath } from "next/cache";

import {
  INITIAL_PREFERENCES_ACTION_STATE,
  parsePreferencesFormData,
  type PreferencesActionState,
} from "@/lib/account/profile-input";
import {
  classifyProfileMutationEnvelope,
  PROFILE_UPDATE_RPC,
  readCommittedProfileVersion,
  type ProfileVersionReader,
} from "@/lib/account/profile-mutation";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

const AUTH_ERROR: PreferencesActionState = {
  ...INITIAL_PREFERENCES_ACTION_STATE,
  status: "error",
  message: "Your session could not be verified. Sign in again and retry.",
};

const CHALLENGE_ERROR: PreferencesActionState = {
  ...INITIAL_PREFERENCES_ACTION_STATE,
  status: "error",
  message: "Finish signing in with your authenticator code before saving changes.",
};

const SERVICE_ERROR: PreferencesActionState = {
  ...INITIAL_PREFERENCES_ACTION_STATE,
  status: "error",
  message: "Preference changes are temporarily unavailable. Please try again.",
};

const STALE_ERROR: PreferencesActionState = {
  ...INITIAL_PREFERENCES_ACTION_STATE,
  status: "stale",
  message: "These preferences changed in another session. Reload before saving again.",
};

export async function updatePreferences(
  _previousState: PreferencesActionState,
  formData: FormData,
): Promise<PreferencesActionState> {
  const parsed = parsePreferencesFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    // The page that hosts this form is unreachable until the second factor is
    // satisfied, but the action behind it is reachable on its own, so it repeats the
    // route guard's requirement as a value instead of a redirect.
    const { decision } = await requireMutationAssurance();
    if (decision === "challenge-required") return CHALLENGE_ERROR;
    if (decision !== "satisfied") return SERVICE_ERROR;

    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    if (!user) return AUTH_ERROR;

    // TODO: Implement Azure SQL preferences update
    // For now, return service error
    return SERVICE_ERROR;
  } catch {
    return SERVICE_ERROR;
  }
}
