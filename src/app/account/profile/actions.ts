"use server";

import { revalidatePath } from "next/cache";

import {
  INITIAL_PROFILE_ACTION_STATE,
  parseProfileFormData,
  type ProfileActionState,
} from "@/lib/account/profile-input";
import {
  classifyProfileMutationEnvelope,
  PROFILE_UPDATE_RPC,
  readCommittedProfileVersion,
  type ProfileVersionReader,
} from "@/lib/account/profile-mutation";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const AUTH_ERROR: ProfileActionState = {
  ...INITIAL_PROFILE_ACTION_STATE,
  status: "error",
  message: "Your session could not be verified. Sign in again and retry.",
};

const CHALLENGE_ERROR: ProfileActionState = {
  ...INITIAL_PROFILE_ACTION_STATE,
  status: "error",
  message: "Finish signing in with your authenticator code before saving changes.",
};

const SERVICE_ERROR: ProfileActionState = {
  ...INITIAL_PROFILE_ACTION_STATE,
  status: "error",
  message: "Profile changes are temporarily unavailable. Please try again.",
};

const STALE_ERROR: ProfileActionState = {
  ...INITIAL_PROFILE_ACTION_STATE,
  status: "stale",
  message: "This profile changed in another session. Reload before saving again.",
};

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = parseProfileFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    // The page that hosts this form is unreachable until the second factor is
    // satisfied, but the action behind it is reachable on its own, so it repeats the
    // route guard's requirement as a value instead of a redirect.
    const { decision } = await requireMutationAssurance();
    if (decision === "challenge-required") return CHALLENGE_ERROR;
    if (decision !== "satisfied") return SERVICE_ERROR;

    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return AUTH_ERROR;

    const { data, error } = await supabase.rpc(PROFILE_UPDATE_RPC, {
      p_expected_profile_version: parsed.data.profileVersion,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_phone: parsed.data.phone,
      p_country: parsed.data.country,
    });
    const envelope = classifyProfileMutationEnvelope(data, error);
    if (envelope.status === "stale") {
      // Hand back the committed version so the retry is not stuck on a stale token.
      const committed = await readCommittedProfileVersion(
        supabase as unknown as ProfileVersionReader,
        authData.user.id,
      );
      // A stale result proves another session committed, so refresh every cached
      // account read, exactly as the success branch does.
      revalidatePath("/account");
      revalidatePath("/account/profile");
      revalidatePath("/account/preferences");
      return committed === null ? STALE_ERROR : { ...STALE_ERROR, profileVersion: committed };
    }
    if (envelope.status === "failure") return SERVICE_ERROR;

    const result = envelope.result;
    if (
      result.user_id !== authData.user.id ||
      result.profile_version !== parsed.data.profileVersion + 1
    ) {
      return SERVICE_ERROR;
    }

    revalidatePath("/account");
    revalidatePath("/account/profile");
    revalidatePath("/account/preferences");
    return {
      ...INITIAL_PROFILE_ACTION_STATE,
      status: "success",
      message: "Profile saved.",
      profileVersion: result.profile_version,
    };
  } catch {
    return SERVICE_ERROR;
  }
}
