import "server-only";

import { CHALLENGE_ERROR_MESSAGE, parseChallengeToken } from "@/lib/auth/challenge";

/**
 * Whether the bot challenge on login, signup and recovery is actually protecting anything.
 *
 * It has two halves and needs both. The site key renders the widget and produces a token;
 * the secret key is what lets this server ask Cloudflare whether the token is real. Only one
 * of them was ever configured: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in production and
 * preflight lists it as a required variable that is present — while all three auth pages
 * hardcoded an empty key, so no widget ever rendered, and nothing anywhere called siteverify.
 * An operator reading the preflight had every reason to believe sign-in was protected.
 *
 * Three states, and the middle one is the point:
 *
 *   off           — neither half configured. The challenge is deliberately not in use.
 *   misconfigured — one half without the other. Reported, never silently treated as
 *                   protection, and never enforced: enforcing a check this server cannot
 *                   verify would lock every customer out, and rendering a widget nothing
 *                   verifies is theatre. Both are worse than being clear about it.
 *   enforced      — both halves configured. The token is required and verified.
 */
export type TurnstileState = "off" | "misconfigured" | "enforced";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileState(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): TurnstileState {
  const site = String(environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  const secret = String(environment.TURNSTILE_SECRET_KEY ?? "").trim();
  if (site && secret) return "enforced";
  if (site || secret) return "misconfigured";
  return "off";
}

/**
 * The site key a page should render, which is none unless the challenge is fully configured.
 *
 * A page that rendered the key whenever it was set would put a widget in front of customers
 * that no server checks — the shape this is here to prevent.
 */
export function turnstileSiteKey(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): string {
  return turnstileState(environment) === "enforced"
    ? String(environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim()
    : "";
}

export type ChallengeOutcome = { ok: true } | { ok: false; message: string };

/**
 * Check a submitted challenge token with Cloudflare.
 *
 * Fails CLOSED on a rejected token and OPEN on an unreachable verifier, and the asymmetry is
 * deliberate: a token Cloudflare says is invalid is the case this exists to stop, while
 * Cloudflare being unreachable is an outage on their side that must not take sign-in down
 * for every customer. The second is logged rather than swallowed so it cannot become a
 * permanent silent bypass.
 */
export async function verifyChallenge(
  value: unknown,
  options: {
    remoteIp?: string | null;
    environment?: Readonly<Partial<Record<string, string>>>;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ChallengeOutcome> {
  const environment = options.environment ?? process.env;
  if (turnstileState(environment) !== "enforced") return { ok: true };

  const parsed = parseChallengeToken(value);
  if (!parsed.success) return { ok: false, message: parsed.message };

  const body = new URLSearchParams({
    secret: String(environment.TURNSTILE_SECRET_KEY ?? ""),
    response: parsed.token,
  });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);

  try {
    const response = await (options.fetchImpl ?? fetch)(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error("[TURNSTILE] verifier answered", response.status);
      return { ok: true };
    }
    const result = (await response.json()) as { success?: boolean };
    return result?.success === true
      ? { ok: true }
      : { ok: false, message: CHALLENGE_ERROR_MESSAGE };
  } catch (error) {
    // Unreachable, timed out, or an unreadable answer. Not the customer's problem.
    console.error("[TURNSTILE] verifier unreachable:", error instanceof Error ? error.name : error);
    return { ok: true };
  }
}
