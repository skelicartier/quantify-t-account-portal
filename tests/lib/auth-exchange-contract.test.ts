/**
 * Contract test for Azure SQL auth callback flow.
 *
 * Tests the redirect destination resolution for auth callbacks.
 */
import { resolveTrustedAuthDestination } from "@/lib/auth/callback";

describe("auth callback destination resolution", () => {
  it("resolves signup confirmation to account page", () => {
    const result = resolveTrustedAuthDestination("signup", null);
    expect(result).toBe("/account");
  });

  it("resolves recovery to reset-password page", () => {
    const result = resolveTrustedAuthDestination("recovery", "recovery");
    expect(result).toBe("/reset-password");
  });

  it("resolves email change to security page", () => {
    const result = resolveTrustedAuthDestination("email-change", null);
    expect(result).toBe("/account/security?notice=email-change-confirmed");
  });

  it("returns null for unknown flow", () => {
    const result = resolveTrustedAuthDestination("unknown" as never, undefined);
    expect(result).toBeNull();
  });
});
