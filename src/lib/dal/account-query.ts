import {
  mapAccountOverview,
  type AccountOverviewDto,
  type AccountProfileState,
} from "@/lib/dto/account";
import { azureFrom } from "@/lib/dal/azure-sql-client";

export const ACCOUNT_PROFILE_COLUMNS = [
  "user_id",
  "first_name",
  "last_name",
  "is_active",
  "subscription_tier",
  "created_at",
  "last_login_at",
].join(",");

type AzureUserResult = { id: string; email: string; [key: string]: unknown } | null;

export const ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE = "Account data is temporarily unavailable.";

/**
 * Generic availability failure. It deliberately carries no provider detail so a
 * server error cannot leak query, schema, or transport information to a client.
 */
export class AccountOverviewUnavailableError extends Error {
  constructor() {
    super(ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE);
    this.name = "AccountOverviewUnavailableError";
  }
}

export type AccountDataClient = {
  getUser: () => Promise<AzureUserResult>;
};

/**
 * Resolve the caller's account overview.
 *
 * Returns `null` only when Auth reports no verified user, which is the single
 * condition that may redirect a visitor to the login route. A thrown Auth
 * transport call and an unusable identity are availability failures, so they
 * raise {@link AccountOverviewUnavailableError} instead of impersonating an
 * invalid session. A degraded profile read still yields an overview DTO whose
 * `profileState` records the degradation.
 */
export async function loadAccountOverview(
  client: AccountDataClient,
): Promise<AccountOverviewDto | null> {
  let identity: AzureUserResult;
  try {
    identity = await client.getUser();
  } catch {
    throw new AccountOverviewUnavailableError();
  }

  if (!identity?.id) return null;

  let profile: unknown = null;
  let profileState: AccountProfileState = "missing";
  try {
    const result = await azureFrom("app_profiles")
      .select(ACCOUNT_PROFILE_COLUMNS)
      .eq("user_id", identity.id)
      .single()
      .execute();

    profile = result.data;
    profileState = result.error ? "unavailable" : result.data ? "ready" : "missing";
  } catch {
    profileState = "unavailable";
  }

  try {
    return mapAccountOverview({ identity, profile, profileState });
  } catch {
    throw new AccountOverviewUnavailableError();
  }
}
