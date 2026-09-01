import {
  mapAccountOverview,
  type AccountIdentity,
  type AccountOverviewDto,
  type AccountProfileState,
} from "@/lib/dto/account";

export const ACCOUNT_PROFILE_COLUMNS = [
  "first_name",
  "last_name",
  "is_active",
  "subscription_tier",
  "created_at",
  "last_login_at",
].join(",");

type AuthUserResult = {
  data: { user: AccountIdentity | null };
  error: unknown;
};

type ProfileResult = {
  data: unknown;
  error: unknown;
};

export type AccountDataClient = {
  auth: {
    getUser: () => Promise<AuthUserResult>;
  };
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

export async function loadAccountOverview(
  client: AccountDataClient,
): Promise<AccountOverviewDto | null> {
  let authResult: AuthUserResult;
  try {
    authResult = await client.auth.getUser();
  } catch {
    return null;
  }

  const identity = authResult.data.user;
  if (authResult.error || !identity?.id) return null;

  let profile: unknown = null;
  let profileState: AccountProfileState = "missing";
  try {
    const result = await client
      .from("app_profiles")
      .select(ACCOUNT_PROFILE_COLUMNS)
      .eq("user_id", identity.id)
      .maybeSingle();
    profile = result.data;
    profileState = result.error ? "unavailable" : result.data ? "ready" : "missing";
  } catch {
    profileState = "unavailable";
  }

  return mapAccountOverview({ identity, profile, profileState });
}
