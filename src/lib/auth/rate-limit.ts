/**
 * Turning the service's refusal into something a person can act on.
 *
 * The Account API now limits sign-in, signup, password recovery and token redemption, and
 * answers a caller who is out of budget with 429 `rate_limited` plus `retry_after_seconds`.
 * Without this module every one of those arrives at the console as an unrecognised failure and
 * is rendered as "temporarily unavailable" — which is both untrue and actively harmful: a
 * person told the service is broken retries immediately and keeps retrying, which is exactly
 * the behaviour the limit exists to stop.
 *
 * TWO THINGS THIS IS CAREFUL ABOUT
 *
 * It repeats no more than the service disclosed. The service deliberately does not say WHICH
 * bucket ran out, because "too many attempts for this account" would confirm the account
 * exists — the one thing every other answer on those routes is written to avoid. So neither
 * does the copy here.
 *
 * It never turns a 429 into a smaller wait than the real one. `retry_after_seconds` is rounded
 * UP to whole minutes; telling somebody to come back in a minute when the lock has four
 * minutes left earns them another refusal and teaches them the message is not worth reading.
 */

import { AccountApiRequestError } from "@/lib/admin/account-api";
import { AzureAuthError } from "@/lib/azure-auth-client";

/** The service's code for a refusal that time alone resolves. */
export const RATE_LIMITED_CODE = "rate_limited";

/**
 * The wait the service asked for, or `null` when this is not a rate-limit refusal.
 *
 * Both error types are checked because the console reaches the Account API two ways: the auth
 * client for sign-in and recovery, the account client for everything behind a session. A limit
 * recognised on only one of them is a limit that renders correctly on only some pages.
 */
/** The two error classes' own `name`, which they set in their constructors. */
const RECOGNISED_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AzureAuthError",
  "AccountApiRequestError",
]);

/**
 * One of our two API errors — by identity where that works, by its own name where it does not.
 *
 * `instanceof` is the right first test and it is not sufficient on its own here. A Next build
 * can evaluate the same module in more than one bundle (a route handler's graph and a server
 * component's are not always the same), and a class evaluated twice produces two constructors
 * that share a name and fail `instanceof` against each other. This module's whole job is to
 * stop a 429 being misread as an outage; falling back on that would be the exact failure it
 * exists to prevent, arriving through the build system instead of through the code.
 *
 * Still a narrow test: the object must be an `Error` carrying one of these two names and a
 * numeric `status`. A plain object shaped like one does not qualify — an untrusted payload
 * must not be able to talk this module into declaring a rate limit.
 */
function apiErrorFields(
  error: unknown,
): { status: number; code: string | null; details: Record<string, unknown> } | null {
  if (error instanceof AzureAuthError || error instanceof AccountApiRequestError) {
    return {
      status: error.status,
      code: typeof error.code === "string" ? error.code : null,
      details: { ...error.details },
    };
  }
  if (!(error instanceof Error) || !RECOGNISED_ERROR_NAMES.has(error.name)) return null;
  const candidate = error as Error & {
    status?: unknown;
    code?: unknown;
    details?: unknown;
  };
  if (typeof candidate.status !== "number") return null;
  const details =
    candidate.details && typeof candidate.details === "object"
      ? { ...(candidate.details as Record<string, unknown>) }
      : {};
  return {
    status: candidate.status,
    code: typeof candidate.code === "string" ? candidate.code : null,
    details,
  };
}

export function rateLimitWaitSeconds(error: unknown): number | null {
  const fields = apiErrorFields(error);
  if (!fields) return null;
  const { status, code, details } = fields;

  // The status is what makes this a rate limit. The code is checked when present, but a 429
  // from a proxy or a gateway in front of the function carries no code at all and is still a
  // rate limit — treating that as an outage would be the same mistake in a different place.
  if (status !== 429) return null;
  if (code !== null && code !== RATE_LIMITED_CODE) return null;

  const raw = Number(details.retry_after_seconds ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    // A 429 with no usable number still has to say something honest. A minute is the shortest
    // lock the service ever applies, so it is the smallest wait that cannot be an understatement.
    return 60;
  }
  return Math.ceil(raw);
}

/**
 * How long to wait, in words.
 *
 * Rounded up and stated loosely on purpose: a countdown to the second invites watching it, and
 * the exact figure is of no use to the person who simply has to come back later.
 */
export function rateLimitMessage(seconds: number): string {
  if (seconds <= 60) return "Too many attempts. Wait a minute before trying again.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Too many attempts. Wait about ${minutes} minutes before trying again.`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1
    ? "Too many attempts. Wait about an hour before trying again."
    : `Too many attempts. Wait about ${hours} hours before trying again.`;
}
