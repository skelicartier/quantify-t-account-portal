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

import { afterResponse } from "@/lib/after-response";
import { getCurrentAssurance, requireSatisfiedAssurance } from "@/lib/dal/assurance-guard";
import {
  AccountActivityUnavailableError,
  AccountSessionsUnavailableError,
  loadAccountActivityEvents,
  loadAccountSessions,
  type AccountSessionDataClient,
} from "@/lib/dal/session-query";
import { heartbeatCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountProfileDto } from "@/lib/dto/profile";
import type { AccountActivityEventDto, AccountSessionDto } from "@/lib/dto/session";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Resolve the caller's account overview using the same failure-class split as the
 * profile loader: `null` means only that Auth reported no verified user, while a
 * failed server-client factory or a loader availability failure raises a generic
 * error. Without this, the account layout would redirect an authenticated visitor
 * to the login page during a transport outage and mask the profile route's 5xx.
 */
export const getCurrentAccount = cache(async (): Promise<AccountOverviewDto | null> => {
  let client: Awaited<ReturnType<typeof createServerAzureClient>>;
  try {
    client = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  } catch {
    // Never surface provider or configuration detail from a failed factory.
    throw new AccountOverviewUnavailableError();
  }
  return await loadAccountOverview(client as AccountDataClient);
});

/**
 * Begin reading what this session owes (its passkey state) without waiting for it. The
 * guards below still await the answer before anything renders; starting it here lets it
 * travel at the same time as the account read instead of after it. The read is made once
 * per request and never rejects, so nothing is left unhandled.
 */
function startAssuranceRead(): void {
  void getCurrentAssurance();
}

export async function requireCurrentAccount(): Promise<AccountOverviewDto> {
  startAssuranceRead();
  const account = await getCurrentAccount();
  if (account === null) redirect("/login");
  // A verified factor must be satisfied before any protected route renders.
  await requireSatisfiedAssurance();
  await heartbeatProtectedAccountApiSession();
  return account;
}

/**
 * Resolve the caller's profile without collapsing distinct failures. A `null`
 * result means only that Auth reported no verified user. Client-creation and
 * loader availability failures propagate so the route renders a generic server
 * error rather than redirecting an authenticated visitor to the login page.
 */
export const getCurrentProfile = cache(async (): Promise<AccountProfileDto | null> => {
  let client: Awaited<ReturnType<typeof createServerAzureClient>>;
  try {
    client = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  } catch {
    // Never surface provider or configuration detail from a failed factory.
    throw new AccountProfileUnavailableError();
  }
  return await loadAccountProfile(client as ProfileDataClient);
});

export async function requireCurrentProfile(): Promise<AccountProfileDto> {
  startAssuranceRead();
  const profile = await getCurrentProfile();
  if (profile === null) redirect("/login");
  // Defense in depth: the page guard repeats the layout's assurance requirement.
  await requireSatisfiedAssurance();
  await heartbeatProtectedAccountApiSession();
  return profile;
}

export const getCurrentSessions = cache(async (): Promise<AccountSessionDto[] | null> => {
  let client: Awaited<ReturnType<typeof createServerAzureClient>>;
  try {
    client = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  } catch {
    throw new AccountSessionsUnavailableError();
  }
  return await loadAccountSessions(client as AccountSessionDataClient);
});

export async function requireCurrentSessions(): Promise<AccountSessionDto[]> {
  startAssuranceRead();
  const sessions = await getCurrentSessions();
  if (sessions === null) redirect("/login");
  await requireSatisfiedAssurance();
  await heartbeatProtectedAccountApiSession();
  return sessions;
}

export const getCurrentActivityEvents = cache(
  async (): Promise<AccountActivityEventDto[] | null> => {
    let client: Awaited<ReturnType<typeof createServerAzureClient>>;
    try {
      client = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    } catch {
      throw new AccountActivityUnavailableError();
    }
    return await loadAccountActivityEvents(client as AccountSessionDataClient);
  },
);

export async function requireCurrentActivityEvents(): Promise<AccountActivityEventDto[]> {
  startAssuranceRead();
  const events = await getCurrentActivityEvents();
  if (events === null) redirect("/login");
  await requireSatisfiedAssurance();
  await heartbeatProtectedAccountApiSession();
  return events;
}

/**
 * Tell the Account API this session is still in use: once per request, and after the
 * page has gone out. It used to be awaited before every page rendered, which made each
 * page wait on a write that nothing on the page reads.
 */
const heartbeatProtectedAccountApiSession = cache(async (): Promise<void> => {
  try {
    // The cookie is read now, while the request is still here; only the call waits.
    const client = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    const accessToken = client.getAccessToken();
    if (!accessToken) return;
    afterResponse(() =>
      heartbeatCurrentAccountApiSession({
        getAccessToken: () => accessToken,
        getUser: async () => null,
      }),
    );
  } catch {
    // Session telemetry must not prevent a verified account page from rendering.
  }
});
