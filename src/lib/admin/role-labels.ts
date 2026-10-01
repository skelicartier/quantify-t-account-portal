import { formatLabel } from "@/lib/format";

/**
 * Human names for the backend's role, capability, and reconciliation vocabularies.
 *
 * The API speaks in stable tokens (`roles:write`, `missing-in-database`); the console
 * speaks to people. Keeping the translation in one file means a token never leaks into
 * the UI by accident, and a new token degrades to a readable label rather than crashing.
 */

/**
 * Every role the API will accept, in descending order of reach — which is the order the
 * picker shows them in, so the list reads as a ladder rather than an alphabet.
 *
 * This mirrors `CANONICAL_ROLES` in the Account API's `capabilities.py`, which is the
 * authority: the console never computes what a role may do, it reads `me.capabilities`
 * as the API resolved them. What it must keep in step is the vocabulary, because a role
 * the console does not know is a role whose `/me` fails to parse.
 */
export const ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "support_manager",
  "billing_manager",
  "auditor",
  "support",
  "user",
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

const ROLE_LABELS: Record<AssignableRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support_manager: "Support manager",
  billing_manager: "Billing manager",
  auditor: "Auditor",
  support: "Support agent",
  user: "User",
};

/**
 * Badge tones. Deliberately fewer than there are roles: the badge says how much reach a
 * role has, and five near-identical outlines would read as five unrelated things rather
 * than as a scale.
 */
export type RoleTone = "owner" | "admin" | "support" | "user";

const ROLE_TONES: Record<AssignableRole, RoleTone> = {
  owner: "owner",
  admin: "admin",
  support_manager: "admin",
  billing_manager: "admin",
  auditor: "support",
  support: "support",
  user: "user",
};

export function roleLabel(role: string | null | undefined): string {
  return isAssignableRole(role) ? ROLE_LABELS[role] : formatLabel(role || "user");
}

export function roleTone(role: string | null | undefined): RoleTone {
  return isAssignableRole(role) ? ROLE_TONES[role] : "user";
}
