/**
 * The console has to recognise the service's new refusal, and has to repeat no more than it
 * disclosed.
 *
 * Two failures are possible here and they look nothing alike. The first is not recognising a
 * 429 at all, which renders a rate limit as "the service is broken" and sends the reader
 * straight back to retry — the opposite of what the limit is for. The second is being too
 * helpful: naming the bucket, or echoing a count, would tell an attacker which of the two
 * limits bit, and "too many attempts for THIS ACCOUNT" is a statement that the account exists.
 *
 * The Account API refuses to disclose that. These tests exist so the console cannot
 * accidentally disclose it on the service's behalf.
 */

import { describe, expect, it } from "vitest";

import { rateLimitMessage, rateLimitWaitSeconds } from "@/lib/auth/rate-limit";
import { AccountApiRequestError } from "@/lib/admin/account-api";
import { AzureAuthError } from "@/lib/azure-auth-client";

function authError(
  status: number,
  code: string | null,
  details: Record<string, unknown> = {},
): AzureAuthError {
  return new AzureAuthError({ status, code, message: "refused", correlationId: null, details });
}

function accountError(
  status: number,
  code: string,
  details: Record<string, unknown> = {},
): AccountApiRequestError {
  return new AccountApiRequestError({
    status,
    code,
    message: "refused",
    correlationId: null,
    details,
  });
}

describe("recognising the service's refusal", () => {
  it("reads the wait out of an auth-client 429", () => {
    expect(rateLimitWaitSeconds(authError(429, "rate_limited", { retry_after_seconds: 240 }))).toBe(
      240,
    );
  });

  it("reads the wait out of an account-client 429", () => {
    // Both clients are checked because the console reaches the service two ways. A limit
    // recognised on only one of them renders correctly on only some pages.
    expect(
      rateLimitWaitSeconds(accountError(429, "rate_limited", { retry_after_seconds: 90 })),
    ).toBe(90);
  });

  it("treats a 429 with no code as a rate limit", () => {
    // A proxy or platform in front of the function answers 429 with no body of ours at all.
    // Calling that an outage would be the same mistake in a different place.
    expect(rateLimitWaitSeconds(authError(429, null))).toBe(60);
  });

  it("does not treat any other status as a rate limit", () => {
    for (const status of [400, 401, 403, 404, 409, 500, 502, 503]) {
      expect(
        rateLimitWaitSeconds(authError(status, "rate_limited", { retry_after_seconds: 60 })),
      ).toBeNull();
    }
  });

  it("does not treat a 429 carrying a different code as this refusal", () => {
    expect(rateLimitWaitSeconds(authError(429, "quota_exhausted"))).toBeNull();
  });

  it("ignores anything that is not one of the two client errors", () => {
    expect(rateLimitWaitSeconds(new Error("boom"))).toBeNull();
    expect(rateLimitWaitSeconds(null)).toBeNull();
    expect(rateLimitWaitSeconds(undefined)).toBeNull();
  });

  it("does not let a plain object claim to be a rate limit", () => {
    // An API response body reaches this code as data. If a bare object shaped like an error
    // qualified, a payload could talk the console into showing a wait that nothing imposed.
    expect(rateLimitWaitSeconds({ status: 429, code: "rate_limited" })).toBeNull();
    expect(
      rateLimitWaitSeconds({ name: "AzureAuthError", status: 429, code: "rate_limited" }),
    ).toBeNull();
  });

  it("recognises the error even when the class identity does not match", () => {
    // A Next build can evaluate one module in two bundles, producing two constructors that
    // share a name and fail `instanceof` against each other. Losing the 429 to that would be
    // this module's own failure mode arriving through the build system.
    const twin = new Error("refused") as Error & Record<string, unknown>;
    twin.name = "AzureAuthError";
    twin.status = 429;
    twin.code = "rate_limited";
    twin.details = { retry_after_seconds: 180 };

    expect(rateLimitWaitSeconds(twin)).toBe(180);
  });

  it("still requires a numeric status on such a twin", () => {
    const twin = new Error("refused") as Error & Record<string, unknown>;
    twin.name = "AccountApiRequestError";
    twin.code = "rate_limited";

    expect(rateLimitWaitSeconds(twin)).toBeNull();
  });

  it("falls back to a minute when the number is missing, absurd or not a number", () => {
    // A 429 with nothing usable still has to say something honest, and a minute is the
    // shortest lock the service ever applies — the smallest wait that cannot understate.
    for (const value of [undefined, null, 0, -30, "soon", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        rateLimitWaitSeconds(authError(429, "rate_limited", { retry_after_seconds: value })),
      ).toBe(60);
    }
  });

  it("never rounds a wait down", () => {
    // Told to come back in a minute when four minutes remain, the reader earns another
    // refusal and learns the message is not worth reading.
    expect(rateLimitWaitSeconds(authError(429, "rate_limited", { retry_after_seconds: 61 }))).toBe(
      61,
    );
    expect(
      rateLimitWaitSeconds(authError(429, "rate_limited", { retry_after_seconds: 59.4 })),
    ).toBe(60);
  });
});

describe("what the reader is told", () => {
  it("says a minute for anything inside the first minute", () => {
    expect(rateLimitMessage(1)).toBe("Too many attempts. Wait a minute before trying again.");
    expect(rateLimitMessage(60)).toBe("Too many attempts. Wait a minute before trying again.");
  });

  it("rounds minutes up, never down", () => {
    expect(rateLimitMessage(61)).toContain("about 2 minutes");
    expect(rateLimitMessage(300)).toContain("about 5 minutes");
    expect(rateLimitMessage(899)).toContain("about 15 minutes");
  });

  it("switches to hours rather than saying 60 minutes", () => {
    expect(rateLimitMessage(3600)).toBe(
      "Too many attempts. Wait about an hour before trying again.",
    );
    expect(rateLimitMessage(7200)).toContain("about 2 hours");
  });

  it("names no bucket, no count and no threshold", () => {
    // The wording is the disclosure surface. "Too many attempts for this account" would
    // confirm the account exists; "5 attempts" would tell an attacker the budget.
    const wordings = [1, 60, 61, 300, 900, 3600, 7200].map(rateLimitMessage);
    for (const wording of wordings) {
      const lowered = wording.toLowerCase();
      for (const forbidden of [
        "account",
        "email",
        "address",
        "ip",
        "password",
        "login:",
        "signup",
        "recovery",
        "attempts remaining",
        "locked",
      ]) {
        expect(lowered, `"${wording}" discloses "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("carries nothing from the refusal but the wait", () => {
    // The real leak this guards: the service could one day put the scope, the threshold or a
    // remaining count in `details`, and a message built from the error object rather than from
    // the number would start repeating it. Two refusals differing in everything BUT the wait
    // must be indistinguishable to the reader.
    const revealing = authError(429, "rate_limited", {
      retry_after_seconds: 300,
      scope: "login:email",
      attempts: 5,
      threshold: 5,
      locked_until: "2026-09-13T00:00:00Z",
    });
    const bare = accountError(429, "rate_limited", { retry_after_seconds: 300 });

    const fromRevealing = rateLimitMessage(rateLimitWaitSeconds(revealing)!);
    const fromBare = rateLimitMessage(rateLimitWaitSeconds(bare)!);
    expect(fromRevealing).toBe(fromBare);
    expect(fromRevealing).not.toContain("login");
  });
});
