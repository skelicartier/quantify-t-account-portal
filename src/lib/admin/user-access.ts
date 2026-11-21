/**
 * Access is by application. What staff see and say about one account's application lives
 * here, so the directory, the account page and the dashboard use the same three words.
 *
 * Nothing here touches the server: the forms in the browser import it directly.
 */

export const ACCESS_STATUSES = ["pending", "approved", "declined"] as const;
export type AccessStatusValue = (typeof ACCESS_STATUSES)[number];

/** The decisions staff can record. Pending is where an application starts, not a decision. */
export const ACCESS_DECISIONS = ["approved", "declined"] as const;
export type AccessDecision = (typeof ACCESS_DECISIONS)[number];

/** The longest reason the service keeps with a decision. */
export const ACCESS_REASON_MAX = 400;

/** One account's access status as the service means it: anything unrecognised is pending. */
export function accessStatusOf(user: { access_status?: string | undefined }): AccessStatusValue {
  const value = (user.access_status ?? "").trim().toLowerCase();
  return (ACCESS_STATUSES as readonly string[]).includes(value)
    ? (value as AccessStatusValue)
    : "pending";
}

export type AdminUserAccessState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_ADMIN_USER_ACCESS_STATE: AdminUserAccessState = {
  status: "idle",
  message: "",
};

/**
 * The reason recorded when somebody approves without typing one. The service keeps a
 * reason with every decision; an approval is usually just "yes", so the console says so
 * for them. A decline has no default: the applicant is owed the actual reason.
 */
export const DEFAULT_APPROVAL_REASON = "Approved in the console.";

const LABELS: Record<AccessStatusValue, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  declined: "Declined",
};

const TONES: Record<AccessStatusValue, "live" | "danger" | "attention"> = {
  pending: "attention",
  approved: "live",
  declined: "danger",
};

export function accessLabel(status: AccessStatusValue): string {
  return LABELS[status];
}

export function accessTone(status: AccessStatusValue): "live" | "danger" | "attention" {
  return TONES[status];
}

export function applicationsLabel(count: number): string {
  return count === 1
    ? "1 application is awaiting review"
    : `${count} applications are awaiting review`;
}
