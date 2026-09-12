import { formatLabel, formatSentence } from "@/lib/format";

/**
 * Human names for the backend's role, capability, and reconciliation vocabularies.
 *
 * The API speaks in stable tokens (`roles:write`, `missing-in-database`); the console
 * speaks to people. Keeping the translation in one file means a token never leaks into
 * the UI by accident, and a new token degrades to a readable label rather than crashing.
 */

export const ASSIGNABLE_ROLES = ["owner", "admin", "support", "user"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

const ROLE_LABELS: Record<AssignableRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Support",
  user: "User",
};

const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  owner: "Full control, including assigning roles and viewing platform configuration.",
  admin: "Manage people, notifications, email, audit and reports. Cannot assign roles.",
  support: "Read accounts and audit history to help people. No changes to accounts.",
  user: "A regular account with access to its own data only.",
};

export type RoleTone = "owner" | "admin" | "support" | "user";

export function roleLabel(role: string | null | undefined): string {
  return isAssignableRole(role) ? ROLE_LABELS[role] : formatLabel(role || "user");
}

export function roleDescription(role: string | null | undefined): string {
  return isAssignableRole(role) ? ROLE_DESCRIPTIONS[role] : "";
}

export function roleTone(role: string | null | undefined): RoleTone {
  return isAssignableRole(role) ? role : "user";
}

const CAPABILITY_LABELS: Record<string, string> = {
  "account:read-self": "View own account",
  "account:read-any": "Administration access",
  "roles:read-report": "Role report access",
  "roles:write": "Manage roles",
  "audit:read": "Audit access",
  "audit:write": "Record audit events",
  "subscription:write": "Manage subscriptions",
  "users:set-active": "Activate or deactivate people",
  "sessions:revoke-any": "Revoke sessions",
  "notifications:write": "Publish notifications and email",
  "configuration:read": "View configuration",
  "credentials:read-status": "View credential status",
  "releases:read-status": "View release status",
};

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? formatSentence(capability.replace(":", " "));
}

const MISMATCH_LABELS: Record<string, string> = {
  match: "In sync",
  "missing-in-database": "Missing from database",
  "missing-in-legacy": "Missing from legacy registry",
  "expected-owner-projection": "Expected owner projection",
  divergent: "Stores disagree",
  "break-glass-override": "Set by configuration",
};

export function mismatchLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return MISMATCH_LABELS[value] ?? formatSentence(value);
}

export type MismatchTone = "live" | "attention" | "neutral";

export function mismatchTone(value: string | null | undefined): MismatchTone {
  if (value === "match" || value === "expected-owner-projection") return "live";
  if (value === "missing-in-legacy") return "neutral";
  return "attention";
}

type RoleReportLike = {
  legacy_source_available: boolean;
  legacy_unparsable_entry_count: number;
  legacy_retirement_ready: boolean;
};

/** The one-line verdict shown on the dashboard and the reconciliation page. */
export function roleReportStatus(report: RoleReportLike | null | undefined): string {
  if (!report) return "Not permitted";
  if (!report.legacy_source_available) return "Legacy store unreadable";
  if (report.legacy_unparsable_entry_count > 0) return "Legacy entries need review";
  if (report.legacy_retirement_ready) return "Ready for reviewed cutover";
  return "Differences need review";
}
