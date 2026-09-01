import { z } from "zod";

export type AccountProfileState = "ready" | "missing" | "unavailable";
export type AccountStatus = "active" | "inactive" | "unknown";

export type AccountOverviewDto = {
  userId: string;
  email: string | null;
  displayName: string;
  initials: string;
  status: AccountStatus;
  subscriptionTier: string;
  memberSince: string | null;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  profileState: AccountProfileState;
};

export type AccountIdentity = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
};

const profileSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  subscription_tier: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  last_login_at: z.string().nullable().optional(),
});

type MapAccountOverviewInput = {
  identity: AccountIdentity;
  profile: unknown;
  profileState: AccountProfileState;
};

function cleanText(value: string | null | undefined, maximumLength = 120): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

function safeDate(value: string | null | undefined): string | null {
  const normalized = cleanText(value, 64);
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null;
}

function accountInitials(firstName: string, lastName: string): string {
  if (!firstName && !lastName) return "QT";
  return `${firstName.charAt(0)}${lastName.charAt(0) || firstName.charAt(1)}`
    .toUpperCase()
    .slice(0, 2);
}

export function mapAccountOverview({
  identity,
  profile,
  profileState,
}: MapAccountOverviewInput): AccountOverviewDto {
  const parsedProfile = profileSchema.safeParse(profile);
  const safeProfile = parsedProfile.success ? parsedProfile.data : null;
  const resolvedProfileState =
    profileState === "ready" && !safeProfile ? "unavailable" : profileState;
  const firstName = cleanText(safeProfile?.first_name);
  const lastName = cleanText(safeProfile?.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Quantify user";
  const email = cleanText(identity.email, 254).toLowerCase() || null;
  const tier = cleanText(safeProfile?.subscription_tier, 64).toLowerCase() || "free";

  let status: AccountStatus = "unknown";
  if (resolvedProfileState === "ready" && safeProfile?.is_active === true) status = "active";
  if (resolvedProfileState === "ready" && safeProfile?.is_active === false) status = "inactive";

  return {
    userId: identity.id,
    email,
    displayName,
    initials: accountInitials(firstName, lastName),
    status,
    subscriptionTier: tier,
    memberSince: safeDate(safeProfile?.created_at) ?? safeDate(identity.created_at),
    lastSignInAt: safeDate(identity.last_sign_in_at) ?? safeDate(safeProfile?.last_login_at),
    emailConfirmed: safeDate(identity.email_confirmed_at) !== null,
    profileState: resolvedProfileState,
  };
}
