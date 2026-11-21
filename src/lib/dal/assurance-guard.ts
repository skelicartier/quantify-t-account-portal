import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AccountApiRequestError,
  fetchAccountApiPasskeys,
  type AccountApiPasskeyAssurance,
  type AccountApiPasskeys,
} from "@/lib/admin/account-api";
import {
  AZURE_PASSWORD_ONLY_ASSURANCE_STATE,
  assuranceForMutation,
  assuranceFromPasskey,
  EMPTY_ASSURANCE_STATE,
  type AssuranceState,
  type MutationAssurance,
} from "@/lib/auth/assurance";
import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";
import type { PasskeyListItem, PasskeyState } from "@/lib/passkeys/state";
import { createServerAzureClient } from "@/lib/supabase/server";

/** Where a session that owes a passkey is sent: the one page that asks for it. */
export const PASSKEY_CHALLENGE_PATH = "/passkey";
export const MFA_CHALLENGE_NOTICE = PASSKEY_CHALLENGE_PATH;

export function passkeyStateFrom(assurance: AccountApiPasskeyAssurance): PasskeyState {
  return {
    mode: assurance.mode,
    staff: assurance.staff,
    enrolled: assurance.enrolled,
    count: assurance.passkeys,
    required: assurance.required,
    verified: assurance.verified,
    fresh: assurance.fresh,
    verifiedUntil: assurance.verified_until,
    freshUntil: assurance.fresh_until,
  };
}

/**
 * A token the Account API will answer, without writing a cookie.
 *
 * The browser drops the access cookie when it expires and keeps the refresh cookie, and
 * the proxy's refreshed pair reaches the browser with this response, not this render. So
 * a render can hold a refresh token and no access token. Asking for the passkey state
 * with nothing would read as "nobody is signed in", and a session that owes a passkey
 * would be let through on every request made that way. The refresh is repeated here in
 * memory instead; nothing is stored, so the proxy's pair stays the one the browser keeps.
 */
async function refreshedAccessToken(stale: string | null): Promise<string | null> {
  try {
    const config = getAzureAuthConfig();
    const store = await cookies();
    const refreshToken = store.get(config.refreshTokenName)?.value;
    if (!refreshToken) return null;
    const session = await new AzureAuthClient(config.apiUrl).refreshSession(stale, refreshToken);
    return session.access_token || null;
  } catch {
    return null;
  }
}

async function signedInWithoutPasskeys(): Promise<AssuranceState> {
  const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  const user = await azure.getUser();
  return user ? AZURE_PASSWORD_ONLY_ASSURANCE_STATE : EMPTY_ASSURANCE_STATE;
}

function isRefusal(error: unknown, status: number): error is AccountApiRequestError {
  return error instanceof AccountApiRequestError && error.status === status;
}

type PasskeyRead =
  | { kind: "answered"; answer: AccountApiPasskeys }
  /** A service from before passkeys, or an account that is not admitted and cannot hold one. */
  | { kind: "none" }
  | { kind: "signed-out" }
  | { kind: "unavailable" };

/**
 * The Account API's own answer about this session's passkeys, read once per request.
 *
 * Four answers are told apart, because they mean different things:
 *
 * - the answer itself: what the rest of this module decides from;
 * - "no such route" (a service from before passkeys) and "this account is not admitted"
 *   (it cannot hold a passkey): nothing is owed;
 * - "this token is not a session": nobody is signed in;
 * - anything else (an outage, an answer that does not parse): unavailable, which is never
 *   read as "nothing is owed".
 */
const readPasskeys = cache(async (): Promise<PasskeyRead> => {
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    let accessToken = azure.getAccessToken() ?? (await refreshedAccessToken(null));
    if (!accessToken) return { kind: "signed-out" };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return { kind: "answered", answer: await fetchAccountApiPasskeys(accessToken) };
      } catch (error) {
        if (isRefusal(error, 404)) return { kind: "none" };
        if (
          isRefusal(error, 403) &&
          (error.code === "access_pending" || error.code === "access_declined")
        ) {
          return { kind: "none" };
        }
        if (isRefusal(error, 401) && attempt === 0) {
          // The access token ran out between the proxy and here: once more with a new one.
          const renewed = await refreshedAccessToken(accessToken);
          if (!renewed) return { kind: "signed-out" };
          accessToken = renewed;
          continue;
        }
        return { kind: isRefusal(error, 401) ? "signed-out" : "unavailable" };
      }
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
});

/**
 * Resolve the caller's assurance state once per request.
 *
 * A read that failed yields the empty state, which reports nothing as readable. That is
 * what lets the two callers below take opposite risks from the same data: rendering does
 * not lock a visitor out of their own account over a transport blip, while
 * Administration and every mutation refuse a state they could not read.
 */
export const getCurrentAssurance = cache(async (): Promise<AssuranceState> => {
  try {
    const read = await readPasskeys();
    if (read.kind === "answered") {
      return assuranceFromPasskey(passkeyStateFrom(read.answer.assurance));
    }
    if (read.kind === "none") return await signedInWithoutPasskeys();
    return EMPTY_ASSURANCE_STATE;
  } catch {
    return EMPTY_ASSURANCE_STATE;
  }
});

export type CurrentPasskeys = {
  passkeys: PasskeyListItem[];
  state: PasskeyState;
  maxPasskeys: number;
};

/**
 * The account's passkeys for the Security page, from the same read. Null when the
 * service could not say (or predates passkeys): the page then offers nothing on a guess.
 */
export const getCurrentPasskeys = cache(async (): Promise<CurrentPasskeys | null> => {
  const read = await readPasskeys();
  if (read.kind !== "answered") return null;
  return {
    passkeys: read.answer.passkeys.map((passkey) => ({
      id: passkey.id,
      name: passkey.name,
      createdAt: passkey.created_at,
      lastUsedAt: passkey.last_used_at,
    })),
    state: passkeyStateFrom(read.answer.assurance),
    maxPasskeys: read.answer.limits.max_passkeys,
  };
});

/**
 * Refuse a protected route when this session still owes its passkey. Without this,
 * adding a passkey would be decoration: the session the password step created would
 * keep serving every authenticated page.
 */
export async function requireSatisfiedAssurance(): Promise<AssuranceState> {
  const assurance = await getCurrentAssurance();
  if (assurance.challengeRequired) redirect(PASSKEY_CHALLENGE_PATH);
  return assurance;
}

/**
 * The Server Action counterpart of the route guard.
 *
 * Actions are reachable independently of the pages that link to them: the proxy admits
 * any session that has a user and knows nothing about assurance. So the action is the
 * boundary, and it has to refuse rather than redirect: a redirect thrown inside a form
 * action would be indistinguishable from success to the form that called it.
 *
 * The resolved state is returned alongside the decision so a caller that also needs it
 * does not pay for a second read, and cannot accidentally consult a different one.
 */
export async function requireMutationAssurance(): Promise<{
  decision: MutationAssurance;
  assurance: AssuranceState;
}> {
  const assurance = await getCurrentAssurance();
  return { decision: assuranceForMutation(assurance), assurance };
}
