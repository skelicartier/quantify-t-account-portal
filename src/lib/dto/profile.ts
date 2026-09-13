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
  notifyWeeklySummary: boolean;
  notifyResearchComplete: boolean;
  notifySecurityAlerts: boolean;
  displayName: string;
  occupation: string;
  company: string;
  bio: string;
  website: string;
  interests: string[];
  markets: string[];
  primaryWorkflow: string;
  experienceLevel: string;
  uiDensity: string;
  timeFormat: string;
  showMarketTimesInLocal: boolean;
  gainColour: string;
  changeDisplay: string;
  pulseMinSeverity: string;
  pulseDesktopAlerts: boolean;
  researchAiDrafting: boolean;
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
  notify_weekly_summary: z.boolean().optional(),
  notify_research_complete: z.boolean().optional(),
  notify_security_alerts: z.boolean().optional(),
  display_name: z.string().optional(),
  occupation: z.string().optional(),
  company: z.string().optional(),
  bio: z.string().optional(),
  website: z.string().optional(),
  interests: z.string().optional(),
  markets: z.string().optional(),
  primary_workflow: z.string().optional(),
  experience_level: z.string().optional(),
  ui_density: z.string().optional(),
  time_format: z.string().optional(),
  show_market_times_in_local: z.boolean().optional(),
  gain_colour: z.string().optional(),
  change_display: z.string().optional(),
  pulse_min_severity: z.string().optional(),
  pulse_desktop_alerts: z.boolean().optional(),
  research_ai_drafting: z.boolean().optional(),
  profile_version: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }),
});

function cleanText(value: string, maximumLength: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, maximumLength);
}

/** A stored comma-separated token list, as an array the form can tick boxes from. */
function tokens(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
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
    notifyWeeklySummary: row.notify_weekly_summary ?? false,
    notifyResearchComplete: row.notify_research_complete ?? true,
    notifySecurityAlerts: row.notify_security_alerts ?? true,
    displayName: cleanText(row.display_name ?? "", 80),
    occupation: cleanText(row.occupation ?? "", 120),
    company: cleanText(row.company ?? "", 120),
    bio: (row.bio ?? "").trim().slice(0, 500),
    website: cleanText(row.website ?? "", 200),
    interests: tokens(row.interests),
    markets: tokens(row.markets),
    primaryWorkflow: cleanText(row.primary_workflow ?? "", 24),
    experienceLevel: cleanText(row.experience_level ?? "", 24),
    uiDensity: cleanText(row.ui_density ?? "", 16) || "comfortable",
    timeFormat: cleanText(row.time_format ?? "", 8) || "24h",
    showMarketTimesInLocal: row.show_market_times_in_local ?? true,
    gainColour: cleanText(row.gain_colour ?? "", 16) || "green_up",
    changeDisplay: cleanText(row.change_display ?? "", 16) || "percent",
    pulseMinSeverity: cleanText(row.pulse_min_severity ?? "", 16) || "medium",
    pulseDesktopAlerts: row.pulse_desktop_alerts ?? true,
    researchAiDrafting: row.research_ai_drafting ?? true,
    profileVersion: row.profile_version,
    updatedAt: row.updated_at,
  };
}
