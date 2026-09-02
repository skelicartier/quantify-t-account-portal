import { mapAccountProfile, type AccountProfileDto } from "@/lib/dto/profile";
import type { AccountIdentity } from "@/lib/dto/account";

export const ACCOUNT_PROFILE_DETAIL_COLUMNS = [
  "user_id",
  "first_name",
  "last_name",
  "phone",
  "country",
  "timezone",
  "default_currency",
  "notify_price_alerts",
  "notify_portfolio_moves",
  "notify_news_digest",
  "profile_version",
  "updated_at",
].join(",");

type AuthResult = {
  data: { user: AccountIdentity | null };
  error: unknown;
};

type ProfileResult = { data: unknown; error: unknown };

export type ProfileDataClient = {
  auth: { getUser: () => Promise<AuthResult> };
  from: (table: "app_profiles") => {
    select: (columns: string) => {
      eq: (
        column: "user_id",
        value: string,
      ) => {
        maybeSingle: () => Promise<ProfileResult>;
      };
    };
  };
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
  let auth: AuthResult;
  try {
    auth = await client.auth.getUser();
  } catch {
    throw new AccountProfileUnavailableError();
  }

  const identity = auth.data?.user ?? null;
  if (auth.error || !identity?.id) return null;

  let result: ProfileResult;
  try {
    result = await client
      .from("app_profiles")
      .select(ACCOUNT_PROFILE_DETAIL_COLUMNS)
      .eq("user_id", identity.id)
      .maybeSingle();
  } catch {
    throw new AccountProfileUnavailableError();
  }

  if (result.error || !result.data) throw new AccountProfileUnavailableError();

  const profile = mapAccountProfile(identity, result.data);
  if (!profile) throw new AccountProfileUnavailableError();
  return profile;
}
