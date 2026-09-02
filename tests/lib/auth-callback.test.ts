import {
  buildAuthCallbackUrl,
  parseAuthCallback,
  resolveTrustedAuthDestination,
} from "@/lib/auth/callback";

describe("authentication callback policy", () => {
  it.each(["signup", "recovery"] as const)(
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

  it("binds destinations to the trusted exchange redirect type", () => {
    expect(resolveTrustedAuthDestination("recovery", "recovery")).toBe("/reset-password");
    expect(resolveTrustedAuthDestination("signup", null)).toBe("/account");
    expect(resolveTrustedAuthDestination("recovery", null)).toBeNull();
    expect(resolveTrustedAuthDestination("signup", "recovery")).toBeNull();
    expect(resolveTrustedAuthDestination("recovery", undefined)).toBeNull();
    expect(resolveTrustedAuthDestination("signup", "signup")).toBeNull();
  });

  it("uses a validated origin and fixed flow marker without accepting a next URL", () => {
    expect(buildAuthCallbackUrl("https://account.quantifyterminal.com", "signup")).toBe(
      "https://account.quantifyterminal.com/auth/confirm?flow=signup",
    );
    expect(buildAuthCallbackUrl("https://account.quantifyterminal.com/", "recovery")).toBe(
      "https://account.quantifyterminal.com/auth/confirm?flow=recovery",
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
