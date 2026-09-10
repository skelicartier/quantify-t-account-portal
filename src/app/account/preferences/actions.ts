"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import {
  INITIAL_PREFERENCES_ACTION_STATE,
  parsePreferencesFormData,
  type PreferencesActionState,
} from "@/lib/account/profile-input";
import { AccountApiRequestError, updateAccountApiProfile } from "@/lib/admin/account-api";
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

function refreshPreferenceRoutes(): void {
  revalidatePath("/account");
  revalidatePath("/account/profile");
  revalidatePath("/account/preferences");
}

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
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const nextVersion = parsed.data.profileVersion + 1;
    const result = await updateAccountApiProfile(
      accessToken,
      {
        expected_profile_version: parsed.data.profileVersion,
        timezone: parsed.data.timezone,
        default_currency: parsed.data.defaultCurrency,
        notify_price_alerts: parsed.data.notifyPriceAlerts,
        notify_portfolio_moves: parsed.data.notifyPortfolioMoves,
        notify_news_digest: parsed.data.notifyNewsDigest,
      },
      { idempotencyKey: randomUUID() },
    );

    if (result.profile.user_id !== user.id || result.profile.profile_version !== nextVersion) {
      return SERVICE_ERROR;
    }

    refreshPreferenceRoutes();
    return {
      ...INITIAL_PREFERENCES_ACTION_STATE,
      status: "success",
      message: "Preferences saved.",
      profileVersion: nextVersion,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.code === "revision_conflict") {
      refreshPreferenceRoutes();
      const version = error.details.profile_version;
      return {
        ...STALE_ERROR,
        profileVersion:
          typeof version === "number" && Number.isSafeInteger(version) && version > 0
            ? version
            : null,
      };
    }
    return SERVICE_ERROR;
  }
}
