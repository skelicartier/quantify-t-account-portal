import { z } from "zod";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const PHONE_CHARACTERS = /^\+?[0-9() .-]*$/u;

export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_PHONE_MAX_LENGTH = 32;
export const PROFILE_COUNTRY_MAX_LENGTH = 80;
export const PROFILE_TIMEZONE_MAX_LENGTH = 80;
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
export const PROFILE_OCCUPATION_MAX_LENGTH = 120;
export const PROFILE_COMPANY_MAX_LENGTH = 120;
export const PROFILE_WEBSITE_MAX_LENGTH = 200;
export const PROFILE_BIO_MAX_LENGTH = 500;

/**
 * The terminal's own vocabulary, not a list invented for this form.
 *
 * These are the exact tokens `services/onboarding_service.py` maps to tab order, watchlist
 * seeding, start tab and panel presets, and the Account API validates against the same set.
 * Three copies of one vocabulary is two too many, but the three live in repositories that
 * cannot import from each other — so they are asserted equal by tests on both sides instead.
 */
export const PROFILE_INTERESTS = [
  { value: "stocks", label: "Equities" },
  { value: "crypto", label: "Crypto" },
  { value: "commodities", label: "Commodities" },
  { value: "currencies", label: "FX" },
  { value: "rates", label: "Rates" },
  { value: "macro", label: "Macro" },
] as const;

export const PROFILE_MARKETS = [
  { value: "us", label: "United States" },
  { value: "europe", label: "Europe" },
  { value: "india", label: "India" },
  { value: "asia", label: "Asia-Pacific" },
] as const;

export const PROFILE_WORKFLOWS = [
  { value: "", label: "No preference" },
  { value: "watch", label: "Watch a list of names" },
  { value: "scan", label: "Scan for opportunities" },
  { value: "research", label: "Research in depth" },
] as const;

export const PROFILE_EXPERIENCE = [
  { value: "", label: "Prefer not to say" },
  { value: "new", label: "New to markets" },
  { value: "intermediate", label: "A few years in" },
  { value: "professional", label: "Professional" },
] as const;

export const PREFERENCE_CHOICES = {
  uiDensity: [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ],
  timeFormat: [
    { value: "24h", label: "24-hour" },
    { value: "12h", label: "12-hour" },
  ],
  // Red-up is the convention across much of Asia. A terminal that cannot express it is
  // telling those users their instincts are wrong.
  gainColour: [
    { value: "green_up", label: "Green is up" },
    { value: "red_up", label: "Red is up" },
  ],
  changeDisplay: [
    { value: "percent", label: "Percentage first" },
    { value: "absolute", label: "Absolute first" },
  ],
  pulseMinSeverity: [
    { value: "low", label: "Everything" },
    { value: "medium", label: "Medium and above" },
    { value: "high", label: "Only high" },
  ],
} as const;

export type ProfileFieldErrors = {
  firstName: string[];
  lastName: string[];
  phone: string[];
  country: string[];
  displayName: string[];
  occupation: string[];
  company: string[];
  website: string[];
  bio: string[];
  /** Interests, markets, experience and workflow — reported against the group they sit in. */
  focus: string[];
  profileVersion: string[];
};

export type PreferencesFieldErrors = {
  timezone: string[];
  defaultCurrency: string[];
  /** Rejected notification checkbox values, surfaced next to the notification group. */
  notifications: string[];
  /** Rejected display choices, surfaced next to the group that holds them. */
  display: string[];
  profileVersion: string[];
};

export type ProfileActionState = {
  status: "idle" | "success" | "error" | "stale";
  message: string | null;
  fieldErrors: ProfileFieldErrors;
  profileVersion: number | null;
};

export type PreferencesActionState = {
  status: "idle" | "success" | "error" | "stale";
  message: string | null;
  fieldErrors: PreferencesFieldErrors;
  profileVersion: number | null;
};

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = {
  status: "idle",
  message: null,
  fieldErrors: {
    firstName: [],
    lastName: [],
    phone: [],
    country: [],
    displayName: [],
    occupation: [],
    company: [],
    website: [],
    bio: [],
    focus: [],
    profileVersion: [],
  },
  profileVersion: null,
};

export const INITIAL_PREFERENCES_ACTION_STATE: PreferencesActionState = {
  status: "idle",
  message: null,
  fieldErrors: {
    timezone: [],
    defaultCurrency: [],
    notifications: [],
    display: [],
    profileVersion: [],
  },
  profileVersion: null,
};

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function boundedText(label: string, maximumLength: number, required: boolean) {
  return z
    .string()
    .transform(normalizedText)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains unsupported characters.`)
    .refine((value) => !required || value.length > 0, `${label} is required.`)
    .refine((value) => value.length <= maximumLength, `${label} is too long.`);
}

function singleString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  return values[0];
}

function checkboxValue(formData: FormData, name: string): boolean | null {
  const values = formData.getAll(name);
  if (values.length === 0) return false;
  if (values.length !== 1 || values[0] !== "on") return null;
  return true;
}

/** A checkbox group: every checked box must be a token from the closed vocabulary. */
function tokenSet(formData: FormData, name: string, allowed: readonly string[]): string | null {
  const values = formData.getAll(name);
  const tokens: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") return null;
    const token = value.trim().toLowerCase();
    if (!allowed.includes(token)) return null;
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens.join(",");
}

function choiceOf(allowed: readonly { value: string }[], label: string) {
  const values = allowed.map((option) => option.value);
  return z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => values.includes(value), `Select a valid ${label}.`);
}

function profileVersion(formData: FormData): number | null {
  const raw = singleString(formData, "profileVersion");
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isSupportedTimezone(value: string): boolean {
  if (value === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value.includes("/");
  } catch {
    return false;
  }
}

function isSupportedCurrency(value: string): boolean {
  if (!/^[A-Z]{3}$/u.test(value)) return false;
  try {
    return Intl.supportedValuesOf("currency").includes(value);
  } catch {
    return ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "SGD"].includes(value);
  }
}

const profileSchema = z.object({
  firstName: boundedText("First name", PROFILE_NAME_MAX_LENGTH, true),
  lastName: boundedText("Last name", PROFILE_NAME_MAX_LENGTH, true),
  phone: boundedText("Phone", PROFILE_PHONE_MAX_LENGTH, false).refine(
    (value) => PHONE_CHARACTERS.test(value),
    "Enter a valid phone number.",
  ),
  country: boundedText("Country", PROFILE_COUNTRY_MAX_LENGTH, true),
  displayName: boundedText("Display name", PROFILE_DISPLAY_NAME_MAX_LENGTH, false),
  occupation: boundedText("Occupation", PROFILE_OCCUPATION_MAX_LENGTH, false),
  company: boundedText("Company", PROFILE_COMPANY_MAX_LENGTH, false),
  website: boundedText("Website", PROFILE_WEBSITE_MAX_LENGTH, false).refine(
    (value) => value === "" || /^https?:\/\/\S+$/u.test(value),
    "Enter a full URL, starting with https://.",
  ),
  bio: z
    .string()
    .transform((value) => value.normalize("NFKC").trim())
    .refine((value) => value.length <= PROFILE_BIO_MAX_LENGTH, "About is too long."),
  experienceLevel: choiceOf(PROFILE_EXPERIENCE, "experience level"),
  primaryWorkflow: choiceOf(PROFILE_WORKFLOWS, "workflow"),
  interests: z.string({ error: "Choose interests from the list." }),
  markets: z.string({ error: "Choose markets from the list." }),
  profileVersion: z
    .number({ error: "This page is out of date. Reload the page and try again." })
    .int()
    .positive(),
});

const preferencesSchema = z.object({
  timezone: z
    .string()
    .trim()
    .max(PROFILE_TIMEZONE_MAX_LENGTH, "Timezone is too long.")
    .refine(isSupportedTimezone, "Select a valid timezone."),
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isSupportedCurrency, "Select a supported currency."),
  notifyPriceAlerts: z.boolean({ error: "Notification choices must be on or off." }),
  notifyPortfolioMoves: z.boolean({ error: "Notification choices must be on or off." }),
  notifyNewsDigest: z.boolean({ error: "Notification choices must be on or off." }),
  notifyWeeklySummary: z.boolean({ error: "Notification choices must be on or off." }),
  notifyResearchComplete: z.boolean({ error: "Notification choices must be on or off." }),
  notifySecurityAlerts: z.boolean({ error: "Notification choices must be on or off." }),
  uiDensity: choiceOf(PREFERENCE_CHOICES.uiDensity, "density"),
  timeFormat: choiceOf(PREFERENCE_CHOICES.timeFormat, "clock format"),
  gainColour: choiceOf(PREFERENCE_CHOICES.gainColour, "gain colour"),
  changeDisplay: choiceOf(PREFERENCE_CHOICES.changeDisplay, "change format"),
  pulseMinSeverity: choiceOf(PREFERENCE_CHOICES.pulseMinSeverity, "Pulse threshold"),
  showMarketTimesInLocal: z.boolean({ error: "Choices must be on or off." }),
  pulseDesktopAlerts: z.boolean({ error: "Choices must be on or off." }),
  researchAiDrafting: z.boolean({ error: "Choices must be on or off." }),
  profileVersion: z
    .number({ error: "This page is out of date. Reload the page and try again." })
    .int()
    .positive(),
});

export function parseProfileFormData(formData: FormData):
  | {
      success: true;
      data: z.infer<typeof profileSchema>;
    }
  | { success: false; state: ProfileActionState } {
  const version = profileVersion(formData);
  const result = profileSchema.safeParse({
    firstName: singleString(formData, "firstName"),
    lastName: singleString(formData, "lastName"),
    phone: singleString(formData, "phone"),
    country: singleString(formData, "country"),
    displayName: singleString(formData, "displayName") ?? "",
    occupation: singleString(formData, "occupation") ?? "",
    company: singleString(formData, "company") ?? "",
    website: singleString(formData, "website") ?? "",
    bio: singleString(formData, "bio") ?? "",
    experienceLevel: singleString(formData, "experienceLevel") ?? "",
    primaryWorkflow: singleString(formData, "primaryWorkflow") ?? "",
    interests: tokenSet(
      formData,
      "interests",
      PROFILE_INTERESTS.map((o) => o.value),
    ),
    markets: tokenSet(
      formData,
      "markets",
      PROFILE_MARKETS.map((o) => o.value),
    ),
    profileVersion: version,
  });
  if (result.success) return { success: true, data: result.data };
  const flattened = z.flattenError(result.error).fieldErrors;
  return {
    success: false,
    state: {
      ...INITIAL_PROFILE_ACTION_STATE,
      status: "error",
      message: "Review the highlighted profile fields.",
      fieldErrors: {
        firstName: flattened.firstName ?? [],
        lastName: flattened.lastName ?? [],
        phone: flattened.phone ?? [],
        country: flattened.country ?? [],
        displayName: flattened.displayName ?? [],
        occupation: flattened.occupation ?? [],
        company: flattened.company ?? [],
        website: flattened.website ?? [],
        bio: flattened.bio ?? [],
        focus: [
          ...(flattened.interests ?? []),
          ...(flattened.markets ?? []),
          ...(flattened.experienceLevel ?? []),
          ...(flattened.primaryWorkflow ?? []),
        ],
        profileVersion: flattened.profileVersion ?? [],
      },
    },
  };
}

export function parsePreferencesFormData(formData: FormData):
  | {
      success: true;
      data: z.infer<typeof preferencesSchema>;
    }
  | { success: false; state: PreferencesActionState } {
  const result = preferencesSchema.safeParse({
    timezone: singleString(formData, "timezone"),
    defaultCurrency: singleString(formData, "defaultCurrency"),
    notifyPriceAlerts: checkboxValue(formData, "notifyPriceAlerts"),
    notifyPortfolioMoves: checkboxValue(formData, "notifyPortfolioMoves"),
    notifyNewsDigest: checkboxValue(formData, "notifyNewsDigest"),
    notifyWeeklySummary: checkboxValue(formData, "notifyWeeklySummary"),
    notifyResearchComplete: checkboxValue(formData, "notifyResearchComplete"),
    notifySecurityAlerts: checkboxValue(formData, "notifySecurityAlerts"),
    uiDensity: singleString(formData, "uiDensity") ?? "comfortable",
    timeFormat: singleString(formData, "timeFormat") ?? "24h",
    gainColour: singleString(formData, "gainColour") ?? "green_up",
    changeDisplay: singleString(formData, "changeDisplay") ?? "percent",
    pulseMinSeverity: singleString(formData, "pulseMinSeverity") ?? "medium",
    showMarketTimesInLocal: checkboxValue(formData, "showMarketTimesInLocal"),
    pulseDesktopAlerts: checkboxValue(formData, "pulseDesktopAlerts"),
    researchAiDrafting: checkboxValue(formData, "researchAiDrafting"),
    profileVersion: profileVersion(formData),
  });
  if (result.success) return { success: true, data: result.data };
  const flattened = z.flattenError(result.error).fieldErrors;
  return {
    success: false,
    state: {
      ...INITIAL_PREFERENCES_ACTION_STATE,
      status: "error",
      message: "Review the highlighted preference fields.",
      fieldErrors: {
        timezone: flattened.timezone ?? [],
        defaultCurrency: flattened.defaultCurrency ?? [],
        notifications: [
          ...(flattened.notifyPriceAlerts ?? []),
          ...(flattened.notifyPortfolioMoves ?? []),
          ...(flattened.notifyNewsDigest ?? []),
          ...(flattened.notifyWeeklySummary ?? []),
          ...(flattened.notifyResearchComplete ?? []),
          ...(flattened.notifySecurityAlerts ?? []),
        ],
        display: [
          ...(flattened.uiDensity ?? []),
          ...(flattened.timeFormat ?? []),
          ...(flattened.gainColour ?? []),
          ...(flattened.changeDisplay ?? []),
          ...(flattened.pulseMinSeverity ?? []),
        ],
        profileVersion: flattened.profileVersion ?? [],
      },
    },
  };
}
