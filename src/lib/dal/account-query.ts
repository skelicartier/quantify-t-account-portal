import {
  mapAccountOverview,
  type AccountOverviewDto,
  type AccountProfileState,
} from "@/lib/dto/account";
import { fetchAccountApiProfile } from "@/lib/admin/account-api";

export const ACCOUNT_PROFILE_ENDPOINT = "auth/user/profile";

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
  getAccessToken: () => string | null;
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

  const accessToken = client.getAccessToken();
  if (!accessToken) throw new AccountOverviewUnavailableError();

  let profile: unknown = null;
  let profileState: AccountProfileState = "missing";
  try {
    profile = (await fetchAccountApiProfile(accessToken)).profile;
    profileState = profile ? "ready" : "missing";
  } catch {
    profileState = "unavailable";
  }

  try {
    return mapAccountOverview({
      identity: {
        ...identity,
        email_confirmed_at: identity.email_confirmed === true ? new Date(0).toISOString() : null,
      },
      profile,
      profileState,
    });
  } catch {
    throw new AccountOverviewUnavailableError();
  }
}
