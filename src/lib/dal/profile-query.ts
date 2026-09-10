import { mapAccountProfile, type AccountProfileDto } from "@/lib/dto/profile";
import { fetchAccountApiProfile } from "@/lib/admin/account-api";

export const ACCOUNT_PROFILE_ENDPOINT = "auth/user/profile";

type AzureUserResult = { id: string; email: string; [key: string]: unknown } | null;

export type ProfileDataClient = {
  getUser: () => Promise<AzureUserResult>;
  getAccessToken: () => string | null;
};

export const PROFILE_UNAVAILABLE_MESSAGE = "Account profile is temporarily unavailable.";

/**
 * Generic availability failure. It deliberately carries no provider detail so a
 * server error cannot leak query, schema, or transport information to a client.
 */
export class AccountProfileUnavailableError extends Error {
  constructor() {
    super(PROFILE_UNAVAILABLE_MESSAGE);
    this.name = "AccountProfileUnavailableError";
  }
}

/**
 * Resolve the caller's own profile.
 *
 * Returns `null` only when Auth reports no verified user, which is the single
 * condition that may send a visitor to the login route. Provider errors, absent
 * rows, malformed DTOs, cross-owner rows, and transport throws are availability
 * failures and raise {@link AccountProfileUnavailableError} so the caller renders
 * a generic server error instead of pretending the session is invalid.
 */
export async function loadAccountProfile(
  client: ProfileDataClient,
): Promise<AccountProfileDto | null> {
  let identity: AzureUserResult;
  try {
    identity = await client.getUser();
  } catch {
    throw new AccountProfileUnavailableError();
  }

  if (!identity?.id) return null;

  const accessToken = client.getAccessToken();
  if (!accessToken) throw new AccountProfileUnavailableError();

  let profile: unknown;
  try {
    profile = (await fetchAccountApiProfile(accessToken)).profile;
  } catch {
    throw new AccountProfileUnavailableError();
  }

  const dto = mapAccountProfile(identity, profile);
  if (!dto) throw new AccountProfileUnavailableError();
  return dto;
}
