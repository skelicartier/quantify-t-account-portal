"use server";

import { revalidatePath } from "next/cache";

import {
  INITIAL_PROFILE_ACTION_STATE,
  parseProfileFormData,
  type ProfileActionState,
} from "@/lib/account/profile-input";
import { azureFrom, azureUpdate } from "@/lib/dal/azure-sql-client";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

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

function refreshProfileRoutes(): void {
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

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = parseProfileFormData(formData);
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
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone,
        country: parsed.data.country,
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
      refreshProfileRoutes();
      return { ...STALE_ERROR, profileVersion: await readCommittedProfileVersion(user.id) };
    }
    if (!rowMatchesVersion(result.data, user.id, nextVersion)) return SERVICE_ERROR;

    refreshProfileRoutes();
    return {
      ...INITIAL_PROFILE_ACTION_STATE,
      status: "success",
      message: "Profile saved.",
      profileVersion: nextVersion,
    };
  } catch {
    return SERVICE_ERROR;
  }
}
