import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { normaliseAccessStatus, type AccessStatus } from "@/lib/account/access";
import { heartbeatAccountApiSession } from "@/lib/account/session-lifecycle";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiMe as fetchAccountApiMeUncached,
  type AccountApiMe,
} from "@/lib/admin/account-api";
import { createServerAzureClient } from "@/lib/supabase/server";

// One `/me` per request: the shell's role and the desktop handoff page both come from it.
const fetchAccountApiMe = cache(fetchAccountApiMeUncached);

function loginDestination(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

async function currentAccessToken(nextPath = "/account"): Promise<string> {
  let token: string | null;
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    token = azure.getAccessToken()?.trim() || null;
  } catch {
    throw new AccountApiUnavailableError();
  }
  if (!token) redirect(loginDestination(nextPath));
  return token;
}

async function currentAccountApiIdentity(nextPath: string): Promise<{
  accessToken: string;
  me: AccountApiMe;
}> {
  const accessToken = await currentAccessToken(nextPath);
  try {
    const me = await fetchAccountApiMe(accessToken);
    await heartbeatAccountApiSession(accessToken);
    return { accessToken, me };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect(loginDestination(nextPath));
    }
    throw error;
  }
}

/**
 * The signed-in caller for the desktop handoff page. A signed-out visitor is sent to
 * sign in and comes back to the same handoff afterwards.
 */
export async function getDesktopConnectIdentity(nextPath: string): Promise<{
  accessToken: string;
  me: AccountApiMe;
}> {
  return currentAccountApiIdentity(nextPath);
}

/**
 * The signed-in account's role, for the rail and the overview to name (a customer's is
 * `user`, which they leave unsaid). Null on every problem — no token, a 401, an outage —
 * because the account pages never depend on it.
 */
export const getAccountRole = cache(async (): Promise<string | null> => {
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    const token = azure.getAccessToken()?.trim();
    if (!token) return null;
    return (await fetchAccountApiMe(token)).role.effective;
  } catch {
    return null;
  }
});

/**
 * The signed-in account's access status as `me` reports it — pending, approved or declined,
 * read from the database the way the access gate reads it — from the same one `me` per
 * request the role comes from. Null on every problem, and from a service whose `me` predates
 * the field, so the caller can fall back rather than guess.
 */
export const getAccountAccessStatus = cache(async (): Promise<AccessStatus | null> => {
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    const token = azure.getAccessToken()?.trim();
    if (!token) return null;
    return normaliseAccessStatus((await fetchAccountApiMe(token)).user.access_status);
  } catch {
    return null;
  }
});
