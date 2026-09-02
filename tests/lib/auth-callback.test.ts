import {
  buildAuthCallbackUrl,
  parseAuthCallback,
  resolveTrustedAuthDestination,
} from "@/lib/auth/callback";

describe("authentication callback policy", () => {
  it.each(["signup", "recovery", "email-change"] as const)(
    "accepts one bounded PKCE code with the expected %s flow label",
    (flow) => {
      const parameters = new URLSearchParams({ code: "one-time-pkce-code", flow });

      expect(parseAuthCallback(parameters)).toEqual({
        success: true,
        data: { code: "one-time-pkce-code", flow },
      });
    },
  );

  it.each([
    new URLSearchParams(),
    new URLSearchParams({ code: "code", flow: "unknown" }),
    new URLSearchParams({ code: " ", flow: "signup" }),
    new URLSearchParams({ code: "x".repeat(4_097), flow: "signup" }),
    new URLSearchParams({ token_hash: "legacy-token", type: "signup" }),
  ])("rejects malformed or unsupported callback shapes", (parameters) => {
    expect(parseAuthCallback(parameters)).toEqual({ success: false });
  });

  it("rejects repeated security parameters", () => {
    const parameters = new URLSearchParams("code=first&code=second&flow=signup");
    expect(parseAuthCallback(parameters)).toEqual({ success: false });
  });

  it("binds destinations to the redirect type the pinned client actually emits", () => {
    // The pinned @supabase/auth-js derives redirectType from the stored PKCE
    // verifier and appends a type only for password recovery, so a confirmation
    // link for signup or for updateUser({ email }) exchanges to null. Requiring
    // any other value for email change would reject every real confirmation.
    expect(resolveTrustedAuthDestination("recovery", "recovery")).toBe("/reset-password");
    expect(resolveTrustedAuthDestination("signup", null)).toBe("/account");
    expect(resolveTrustedAuthDestination("email-change", null)).toBe(
      "/account/security?notice=email-change-confirmed",
    );
  });

  it("refuses a recovery exchange on any flow but recovery", () => {
    // The one escalation that matters: /reset-password is the only destination that
    // authorizes a password change without the current password, so a recovery link
    // must never be spent anywhere else and no other value may reach it.
    expect(resolveTrustedAuthDestination("email-change", "recovery")).toBeNull();
    expect(resolveTrustedAuthDestination("signup", "recovery")).toBeNull();
    expect(resolveTrustedAuthDestination("recovery", null)).toBeNull();
    expect(resolveTrustedAuthDestination("recovery", undefined)).toBeNull();
    expect(resolveTrustedAuthDestination("recovery", "email_change")).toBeNull();
  });

  it("refuses any value the pinned client cannot produce", () => {
    for (const flow of ["signup", "email-change"] as const) {
      expect(resolveTrustedAuthDestination(flow, undefined)).toBeNull();
      expect(resolveTrustedAuthDestination(flow, "email_change")).toBeNull();
      expect(resolveTrustedAuthDestination(flow, "signup")).toBeNull();
      expect(resolveTrustedAuthDestination(flow, "")).toBeNull();
      expect(resolveTrustedAuthDestination(flow, 0)).toBeNull();
    }
  });

  it("uses a validated origin and fixed flow marker without accepting a next URL", () => {
    expect(buildAuthCallbackUrl("https://account.quantifyterminal.com", "signup")).toBe(
      "https://account.quantifyterminal.com/auth/confirm?flow=signup",
    );
    expect(buildAuthCallbackUrl("https://account.quantifyterminal.com/", "recovery")).toBe(
      "https://account.quantifyterminal.com/auth/confirm?flow=recovery",
    );
    expect(buildAuthCallbackUrl("https://account.quantifyterminal.com", "email-change")).toBe(
      "https://account.quantifyterminal.com/auth/confirm?flow=email-change",
    );
  });

  it("does not include attacker-controlled destinations in parsed callback data", () => {
    const parameters = new URLSearchParams({
      code: "one-time-code",
      flow: "signup",
      next: "https://evil.example/steal",
    });

    const result = parseAuthCallback(parameters);
    expect(result).toEqual({
      success: true,
      data: { code: "one-time-code", flow: "signup" },
    });
    expect(JSON.stringify(result)).not.toContain("evil.example");
  });
});
