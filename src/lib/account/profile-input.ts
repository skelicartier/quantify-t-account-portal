import { z } from "zod";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const PHONE_CHARACTERS = /^\+?[0-9() .-]*$/u;

export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_PHONE_MAX_LENGTH = 32;
export const PROFILE_COUNTRY_MAX_LENGTH = 80;
export const PROFILE_TIMEZONE_MAX_LENGTH = 80;

export type ProfileFieldErrors = {
  firstName: string[];
  lastName: string[];
  phone: string[];
  country: string[];
  profileVersion: string[];
};

export type PreferencesFieldErrors = {
  timezone: string[];
  defaultCurrency: string[];
  /** Rejected notification checkbox values, surfaced next to the notification group. */
  notifications: string[];
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
        ],
        profileVersion: flattened.profileVersion ?? [],
      },
    },
  };
}
