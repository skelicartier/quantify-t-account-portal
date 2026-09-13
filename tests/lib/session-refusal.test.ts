import { AzureAuthError } from "@/lib/azure-auth-client";
import { isSessionRefusal } from "@/lib/supabase/update-session";

/**
 * A refused session ends. An unreachable service does not end one.
 *
 * The refresh path used to clear the auth cookies from a bare `catch`, so any failure at all
 * signed the user out: a momentary 5xx from the Account API, a dropped connection, a reply
 * that was not JSON. Every console user was made to type their password again because of an
 * outage that said nothing about whether their session was still valid.
 */
function authError(status: number, code = "x"): AzureAuthError {
  return new AzureAuthError({ status, code, message: "failed", correlationId: null });
}

describe("isSessionRefusal", () => {
  it.each([401, 403])("treats %i as the service refusing this token", (status) => {
    expect(isSessionRefusal(authError(status))).toBe(true);
  });

  it.each([500, 502, 503, 504, 429])("treats %i as an outage, not a sign-out", (status) => {
    expect(isSessionRefusal(authError(status))).toBe(false);
  });

  it("treats a network failure as an outage", () => {
    // `request()` reports a fetch that never completed as status 0.
    expect(isSessionRefusal(authError(0, "network_error"))).toBe(false);
  });

  it("treats an unreadable reply as an outage", () => {
    expect(isSessionRefusal(authError(200, "invalid_response"))).toBe(false);
  });

  it.each([new Error("boom"), "boom", null, undefined])(
    "does not end a session over something that is not an auth error (%s)",
    (thrown) => {
      expect(isSessionRefusal(thrown)).toBe(false);
    },
  );
});
