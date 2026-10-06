import "server-only";

import { redirect } from "next/navigation";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  ENTITLEMENT_CHANGED_EVENT,
  fetchAccountApiEntitlements,
  SUBSCRIPTION_CHANGED_EVENT,
  type AccountApiEntitlements,
} from "@/lib/admin/account-api";
import { accessRefusal } from "@/lib/account/access";
import { AccountAccessHeldError } from "@/lib/dal/access";
import { getCurrentActivityEvents, requireCurrentAccount } from "@/lib/dal/account";
import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountActivityEventDto } from "@/lib/dto/session";
import { createServerAzureClient } from "@/lib/supabase/server";

const SIGN_IN_DESTINATION = "/login?next=%2Faccount%2Fsubscription";

/** The plan and override changes this account has been the subject of. */
const HISTORY_EVENT_TYPES: readonly string[] = [
  SUBSCRIPTION_CHANGED_EVENT,
  ENTITLEMENT_CHANGED_EVENT,
];

export type AccountSubscriptionView = {
  account: AccountOverviewDto;
  entitlements: AccountApiEntitlements;
  /** Plan and override changes from the account's own audit trail, newest first. */
  history: AccountActivityEventDto[];
  /** `true` when the audit trail could not be read; the page says so instead of lying. */
  historyUnavailable: boolean;
};

/**
 * The signed-in caller's own entitlement document, plus the trail of changes to it.
 *
 * The entitlements read is the page: without it there is nothing to show, so a failure
 * surfaces. The history is context, and an activity outage must not deny someone the
 * plan they are paying for — so it degrades to an empty list the page labels.
 */
export async function requireCurrentSubscription(): Promise<AccountSubscriptionView> {
  const account = await requireCurrentAccount();

  const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  const accessToken = azure.getAccessToken();
  if (!accessToken) redirect(SIGN_IN_DESTINATION);

  let entitlements: AccountApiEntitlements;
  try {
    entitlements = await fetchAccountApiEntitlements(accessToken);
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect(SIGN_IN_DESTINATION);
    }
    // A held account has no plan to read yet; that is the access message, not an outage.
    const hold = accessRefusal(error);
    if (hold) throw new AccountAccessHeldError(hold);
    throw new AccountApiUnavailableError();
  }

  const events = await getCurrentActivityEvents().catch(() => null);
  const history = (events ?? [])
    .filter((event) => HISTORY_EVENT_TYPES.includes(event.eventType))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

  return { account, entitlements, history, historyUnavailable: events === null };
}
