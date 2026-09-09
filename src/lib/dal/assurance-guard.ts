import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  AZURE_PASSWORD_ONLY_ASSURANCE_STATE,
  assuranceForMutation,
  EMPTY_ASSURANCE_STATE,
  type AssuranceState,
  type MutationAssurance,
} from "@/lib/auth/assurance";
import { createServerAzureClient } from "@/lib/supabase/server";

export const MFA_CHALLENGE_NOTICE = "/login?notice=mfa-required";

/**
 * Resolve the caller's assurance state once per request.
 *
 * A total failure here yields the empty state, which reports nothing as readable.
 * That distinction is what lets the two callers below take opposite risks from the
 * same data: rendering must not lock a visitor out of their own account over a
 * transport blip, while a mutation must not proceed on state it could not read.
 */
export const getCurrentAssurance = cache(async (): Promise<AssuranceState> => {
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    const user = await azure.getUser();
    return user ? AZURE_PASSWORD_ONLY_ASSURANCE_STATE : EMPTY_ASSURANCE_STATE;
  } catch {
    return EMPTY_ASSURANCE_STATE;
  }
});

/**
 * Refuse a protected route when the provider says this session still owes a second
 * factor. Without this, enrolling TOTP would be decoration: the AAL1 session created
 * by the password step alone would keep serving every authenticated page.
 */
export async function requireSatisfiedAssurance(): Promise<AssuranceState> {
  const assurance = await getCurrentAssurance();
  if (assurance.challengeRequired) redirect(MFA_CHALLENGE_NOTICE);
  return assurance;
}

/**
 * The Server Action counterpart of the route guard.
 *
 * Actions are reachable independently of the pages that link to them — the proxy
 * admits any session that has a user and knows nothing about assurance levels, and
 * `login` deliberately leaves a live AAL1 cookie in place because the provider's own
 * MFA challenge needs that session to exist. So the action is the boundary, and it
 * has to refuse rather than redirect: a redirect thrown inside a form action would be
 * indistinguishable from success to the form that called it.
 *
 * The resolved state is returned alongside the decision so a caller that also needs
 * the provider-attested factor list — enroll, confirm, remove — does not pay for a
 * second provider read, and cannot accidentally consult a different one.
 */
export async function requireMutationAssurance(): Promise<{
  decision: MutationAssurance;
  assurance: AssuranceState;
}> {
  const assurance = await getCurrentAssurance();
  return { decision: assuranceForMutation(assurance), assurance };
}
