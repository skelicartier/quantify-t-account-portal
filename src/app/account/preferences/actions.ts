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
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
      p_timezone: parsed.data.timezone,
      p_default_currency: parsed.data.defaultCurrency,
      p_notify_price_alerts: parsed.data.notifyPriceAlerts,
      p_notify_portfolio_moves: parsed.data.notifyPortfolioMoves,
      p_notify_news_digest: parsed.data.notifyNewsDigest,
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
      ...INITIAL_PREFERENCES_ACTION_STATE,
      status: "success",
      message: "Preferences saved.",
      profileVersion: result.profile_version,
    };
  } catch {
    return SERVICE_ERROR;
  }
}
