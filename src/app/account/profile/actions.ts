"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import {
  INITIAL_PROFILE_ACTION_STATE,
  parseProfileFormData,
  type ProfileActionState,
} from "@/lib/account/profile-input";
import { AccountApiRequestError, updateAccountApiProfile } from "@/lib/admin/account-api";
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
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const nextVersion = parsed.data.profileVersion + 1;
    const result = await updateAccountApiProfile(
      accessToken,
      {
        expected_profile_version: parsed.data.profileVersion,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone,
        country: parsed.data.country,
        display_name: parsed.data.displayName,
        occupation: parsed.data.occupation,
        company: parsed.data.company,
        website: parsed.data.website,
        bio: parsed.data.bio,
        experience_level: parsed.data.experienceLevel,
        // Interests and markets are the terminal's own vocabulary: the same tokens the
        // desktop's first-run wizard maps to tab order, watchlist seeding and panel presets.
        // Changing them here re-tunes the product, which is why they belong on the profile
        // rather than only in a wizard nobody can reopen.
        interests: parsed.data.interests,
        markets: parsed.data.markets,
        primary_workflow: parsed.data.primaryWorkflow,
      },
      { idempotencyKey: randomUUID() },
    );

    if (result.profile.user_id !== user.id || result.profile.profile_version !== nextVersion) {
      return SERVICE_ERROR;
    }

    refreshProfileRoutes();
    return {
      ...INITIAL_PROFILE_ACTION_STATE,
      status: "success",
      message: "Profile saved.",
      profileVersion: nextVersion,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.code === "revision_conflict") {
      refreshProfileRoutes();
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
