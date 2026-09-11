import { z } from "zod";

import type { AccountIdentity } from "@/lib/dto/account";

export type AccountProfileDto = {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  timezone: string;
  defaultCurrency: string;
  notifyPriceAlerts: boolean;
  notifyPortfolioMoves: boolean;
  notifyNewsDigest: boolean;
  profileVersion: number;
  updatedAt: string;
};

const identitySchema = z.object({
  id: z.guid(),
  email: z.string().nullable().optional(),
});

const profileSchema = z.object({
  user_id: z.guid(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
  country: z.string(),
  timezone: z.string(),
  default_currency: z.string(),
  notify_price_alerts: z.boolean(),
  notify_portfolio_moves: z.boolean(),
  notify_news_digest: z.boolean(),
  profile_version: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }),
});

function cleanText(value: string, maximumLength: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, maximumLength);
}

export function mapAccountProfile(
  identity: AccountIdentity,
  profile: unknown,
): AccountProfileDto | null {
  const parsedIdentity = identitySchema.safeParse(identity);
  const parsedProfile = profileSchema.safeParse(profile);
  if (!parsedIdentity.success || !parsedProfile.success) return null;
  if (parsedIdentity.data.id !== parsedProfile.data.user_id) return null;

  const row = parsedProfile.data;
  return {
    userId: row.user_id,
    email: cleanText(parsedIdentity.data.email ?? "", 254).toLowerCase() || null,
    firstName: cleanText(row.first_name, 80),
    lastName: cleanText(row.last_name, 80),
    phone: cleanText(row.phone, 32),
    country: cleanText(row.country, 80),
    timezone: cleanText(row.timezone, 80) || "UTC",
    defaultCurrency: cleanText(row.default_currency, 3).toUpperCase() || "USD",
    notifyPriceAlerts: row.notify_price_alerts,
    notifyPortfolioMoves: row.notify_portfolio_moves,
    notifyNewsDigest: row.notify_news_digest,
    profileVersion: row.profile_version,
    updatedAt: row.updated_at,
  };
}
