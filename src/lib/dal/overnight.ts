import "server-only";

import { cache } from "react";

import { accessRefusal, type AccessHold } from "@/lib/account/access";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiOvernight,
  fetchAccountApiOvernightBrief,
  type OvernightBrief,
  type OvernightMorning,
} from "@/lib/admin/account-api";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Reading the morning briefs the desktop filed in this account.
 *
 * Degrades rather than throws, like the portfolios view: a brief that cannot be read is
 * said so on a working page. Not assurance-gated either — it is the account's own reading,
 * built from its own book, and the same brief the terminal shows without a second factor.
 *
 * "No brief for that morning" and "could not read" are different answers and stay
 * different: one is an old link, the other is an outage, and the page says which.
 */
export type OvernightView =
  | { status: "ready"; mornings: OvernightMorning[]; keep: number }
  | { status: "unavailable" }
  // A held account (pending or declined): the API refuses the read, the page says why.
  | { status: "access"; access: AccessHold };

export type OvernightBriefView =
  | { status: "ready"; brief: OvernightBrief; receivedAt: string | null }
  | { status: "missing" }
  | { status: "unavailable" };

async function token(): Promise<string | null> {
  const azure = await createServerAzureClient();
  return azure.getAccessToken() ?? null;
}

export const getOvernightMornings = cache(async (): Promise<OvernightView> => {
  const accessToken = await token();
  if (!accessToken) return { status: "unavailable" };
  try {
    const data = await fetchAccountApiOvernight(accessToken);
    return { status: "ready", mornings: data.mornings, keep: data.keep };
  } catch (error) {
    const hold = accessRefusal(error);
    if (hold) return { status: "access", access: hold };
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
});

export const getOvernightBrief = cache(async (date: string): Promise<OvernightBriefView> => {
  const accessToken = await token();
  if (!accessToken) return { status: "unavailable" };
  try {
    const data = await fetchAccountApiOvernightBrief(accessToken, date);
    return { status: "ready", brief: data.brief, receivedAt: data.received_at };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 404) {
      return { status: "missing" };
    }
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
});
