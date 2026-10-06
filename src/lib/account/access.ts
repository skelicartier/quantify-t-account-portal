/**
 * Access is by application.
 *
 * Every account carries an access status on the Account API: `pending` (applied, not yet
 * decided — every new account starts here), `approved` or `declined`. A pending or declined
 * account still signs in to the console, because the console is where it reads its status and
 * where it exports or deletes what is held about it. What it cannot do is use the product: the
 * API answers every other route with `access_pending` / `access_declined`.
 *
 * The two sentences below are the service's own (`errors.py`), held here word for word and
 * checked against it by `tests/lib/access-contract.test.ts`. They are shown by code, never by
 * echoing the refusal's message, so a refusal can never put provider detail on a page.
 *
 * No `server-only` import: the banner and the desktop handoff form render these on the client.
 */

export type AccessStatus = "pending" | "approved" | "declined";
/** The two statuses that hold an account back from the product. */
export type AccessHold = Exclude<AccessStatus, "approved">;

export const ACCESS_PENDING_MESSAGE =
  "Your application is being reviewed. We will email you as soon as it has been decided.";
export const ACCESS_DECLINED_MESSAGE =
  "Your application was not approved. You can still sign in to the console to export or delete your data.";

export const ACCESS_MESSAGES: Record<AccessHold, string> = {
  pending: ACCESS_PENDING_MESSAGE,
  declined: ACCESS_DECLINED_MESSAGE,
};

/** A heading for each hold: what the state is, in two or three words. */
export const ACCESS_TITLES: Record<AccessHold, string> = {
  pending: "Application under review",
  declined: "Application not approved",
};

/**
 * The console pages a held account can still use, because every route behind them is one the
 * API's access gate leaves open (`access.OPEN_ROUTES`: the profile, sessions and sign-out,
 * activity, notices, the export and the deletion request, and the acts that only take risk
 * away — the kill switch, revoking an authorisation, removing a broker connection). Overnight,
 * Subscription and Portfolios read gated routes and show the hold instead.
 */
export const OPEN_ACCOUNT_PAGES: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/sessions", label: "Sessions" },
  { href: "/account/activity", label: "Activity" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/data", label: "Data export and deletion" },
  { href: "/account/brokers", label: "the Brokers kill switch" },
];

/** The status a response carried, or null when it carried none the console recognises. */
export function normaliseAccessStatus(value: unknown): AccessStatus | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return text === "pending" || text === "approved" || text === "declined" ? text : null;
}

/** Whether a status holds the account back, and which hold it is. */
export function accessHoldOf(
  status: AccessStatus | "unknown" | null | undefined,
): AccessHold | null {
  return status === "pending" || status === "declined" ? status : null;
}

/**
 * The hold a refusal stands for, or null when it is some other failure.
 *
 * Read off the error's `code`, which both the Account API client's `AccountApiRequestError`
 * and the auth client's `AzureAuthError` carry, so one check serves every call site.
 */
export function accessRefusal(error: unknown): AccessHold | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (code === "access_pending") return "pending";
  if (code === "access_declined") return "declined";
  return null;
}
