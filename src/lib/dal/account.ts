import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  AccountOverviewUnavailableError,
  loadAccountOverview,
  type AccountDataClient,
} from "@/lib/dal/account-query";
import {
  AccountProfileUnavailableError,
  loadAccountProfile,
  type ProfileDataClient,
} from "@/lib/dal/profile-query";

import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountProfileDto } from "@/lib/dto/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Resolve the caller's account overview using the same failure-class split as the
 * profile loader: `null` means only that Auth reported no verified user, while a
 * failed server-client factory or a loader availability failure raises a generic
 * error. Without this, the account layout would redirect an authenticated visitor
 * to the login page during a transport outage and mask the profile route's 5xx.
 */
export const getCurrentAccount = cache(async (): Promise<AccountOverviewDto | null> => {
  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    client = await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
  } catch {
    // Never surface provider or configuration detail from a failed factory.
    throw new AccountOverviewUnavailableError();
  }
  return await loadAccountOverview(client as unknown as AccountDataClient);
});

export async function requireCurrentAccount(): Promise<AccountOverviewDto> {
  const account = await getCurrentAccount();
  if (account === null) redirect("/login");
  return account;
}

/**
 * Resolve the caller's profile without collapsing distinct failures. A `null`
 * result means only that Auth reported no verified user. Client-creation and
 * loader availability failures propagate so the route renders a generic server
 * error rather than redirecting an authenticated visitor to the login page.
 */
export const getCurrentProfile = cache(async (): Promise<AccountProfileDto | null> => {
  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    client = await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
  } catch {
    // Never surface provider or configuration detail from a failed factory.
    throw new AccountProfileUnavailableError();
  }
  return await loadAccountProfile(client as unknown as ProfileDataClient);
});

export async function requireCurrentProfile(): Promise<AccountProfileDto> {
  const profile = await getCurrentProfile();
  if (profile === null) redirect("/login");
  return profile;
}
