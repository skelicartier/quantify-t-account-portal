import "server-only";

import { cache } from "react";

import { accessRefusal, type AccessHold } from "@/lib/account/access";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiPortfolios,
  type AccountApiPortfolios,
} from "@/lib/admin/account-api";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Reading this account's portfolios.
 *
 * Degrades rather than throws, like the brokers view. A portfolio list that cannot be read
 * is a reason to say so on an otherwise working page, not a reason to replace the page with
 * an error — someone who came here to check which book is their default still gets the rest
 * of the console.
 *
 * Deliberately NOT assurance-gated, where the brokers view is. The distinction is what the
 * two reads expose: a broker connection says which brokerage accounts a person holds and is
 * one step from moving money, while a portfolio list is the customer's own bookkeeping.
 * Gating this would ask for a second factor to read a list of names.
 */
export type PortfoliosView =
  | { status: "ready"; data: AccountApiPortfolios }
  | { status: "unavailable" }
  // A held account (pending or declined): the API refuses the read, the page says why.
  | { status: "access"; access: AccessHold };

export const getPortfolios = cache(async (): Promise<PortfoliosView> => {
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { status: "unavailable" };

  try {
    return { status: "ready", data: await fetchAccountApiPortfolios(accessToken) };
  } catch (error) {
    const hold = accessRefusal(error);
    if (hold) return { status: "access", access: hold };
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
});
