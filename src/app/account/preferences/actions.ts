"use server";

import { revalidatePath } from "next/cache";

import {
  INITIAL_PREFERENCES_ACTION_STATE,
  parsePreferencesFormData,
  type PreferencesActionState,
} from "@/lib/account/profile-input";
import { azureFrom, azureUpdate } from "@/lib/dal/azure-sql-client";
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

async function readCommittedProfileVersion(userId: string): Promise<number | null> {
  try {
    const result = await azureFrom<{ profile_version: number }>("app_profiles")
      .select("profile_version")
      .eq("user_id", userId)
      .single()
      .execute();
    const version = result.data?.profile_version;
    return !result.error &&
      typeof version === "number" &&
      Number.isSafeInteger(version) &&
      version > 0
      ? version
      : null;
  } catch {
    return null;
  }
}

function rowMatchesVersion(row: unknown, userId: string, profileVersion: number): boolean {
  if (!row || typeof row !== "object") return false;
  const data = row as { user_id?: unknown; profile_version?: unknown };
  return data.user_id === userId && data.profile_version === profileVersion;
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

    const nextVersion = parsed.data.profileVersion + 1;
    const result = await azureUpdate(
      "app_profiles",
      {
        timezone: parsed.data.timezone,
        default_currency: parsed.data.defaultCurrency,
        notify_price_alerts: parsed.data.notifyPriceAlerts,
        notify_portfolio_moves: parsed.data.notifyPortfolioMoves,
        notify_news_digest: parsed.data.notifyNewsDigest,
        profile_version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      [
        { column: "user_id", value: user.id },
        { column: "profile_version", value: parsed.data.profileVersion },
      ],
    );

    if (result.error) return SERVICE_ERROR;
    if (!result.data) {
      refreshPreferenceRoutes();
      return { ...STALE_ERROR, profileVersion: await readCommittedProfileVersion(user.id) };
    }
    if (!rowMatchesVersion(result.data, user.id, nextVersion)) return SERVICE_ERROR;

    refreshPreferenceRoutes();
    return {
      ...INITIAL_PREFERENCES_ACTION_STATE,
      status: "success",
      message: "Preferences saved.",
      profileVersion: nextVersion,
    };
  } catch {
    return SERVICE_ERROR;
  }
}
