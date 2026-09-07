/**
 * Contract test for Azure SQL auth callback flow.
 *
 * Tests the redirect destination resolution for auth callbacks.
 */
import { resolveTrustedAuthDestination } from "@/lib/auth/callback";

describe("auth callback destination resolution", () => {
  it("resolves signup confirmation to account page", () => {
    const result = resolveTrustedAuthDestination("signup", "signup");
    expect(result).toBe("/account");
  });

  it("resolves recovery to reset-password page", () => {
    const result = resolveTrustedAuthDestination("recovery", undefined);
    expect(result).toBe("/reset-password");
  });

  it("resolves email change to security page", () => {
    const result = resolveTrustedAuthDestination("email-change", undefined);
    expect(result).toBe("/account/security");
  });

  it("returns null for unknown flow", () => {
    const result = resolveTrustedAuthDestination("recovery" as never, undefined);
    expect(result).toBe("/reset-password");
  });
});
