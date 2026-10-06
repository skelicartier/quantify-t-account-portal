import { mapAccountOverview } from "@/lib/dto/account";

describe("account overview DTO", () => {
  it("projects only approved identity and profile fields", () => {
    const passcodeHash = "legacy-pin-hash-must-not-cross-the-dto";
    const accessToken = "access-token-must-not-cross-the-dto";
    const identity = {
      id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
      email: "  USER@Example.com ",
      created_at: "2024-01-02T03:04:05.000Z",
      last_sign_in_at: "2026-09-01T10:00:00.000Z",
      email_confirmed_at: "2024-01-02T03:05:00.000Z",
      user_metadata: { app_passcode_hash: passcodeHash, first_name: "Untrusted" },
      access_token: accessToken,
    };

    const overview = mapAccountOverview({
      identity,
      profile: {
        user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
        first_name: " Avery ",
        last_name: " Stone ",
        is_active: true,
        subscription_tier: " Professional ",
        created_at: "2024-01-03T03:04:05.000Z",
        last_login_at: "2026-08-31T10:00:00.000Z",
      },
      profileState: "ready",
    });

    expect(overview).toEqual({
      userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
      email: "user@example.com",
      displayName: "Avery Stone",
      initials: "AS",
      status: "active",
      subscriptionTier: "professional",
      memberSince: "2024-01-03T03:04:05.000Z",
      lastSignInAt: "2026-09-01T10:00:00.000Z",
      emailConfirmed: true,
      profileState: "ready",
      // Neither the identity nor the profile here names an access status.
      accessStatus: "unknown",
    });

    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain(passcodeHash);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain("user_metadata");
    expect(serialized).not.toContain("app_passcode_hash");
  });

  it("fails closed when the profile is absent or malformed", () => {
    const overview = mapAccountOverview({
      identity: {
        id: "85a8c71f-d1b8-4477-80ce-61b4e6fb7909",
        email: null,
        created_at: "not-a-date",
        last_sign_in_at: null,
        email_confirmed_at: null,
      },
      profile: null,
      profileState: "missing",
    });

    expect(overview).toMatchObject({
      email: null,
      displayName: "Quantify user",
      initials: "QT",
      status: "unknown",
      subscriptionTier: "free",
      memberSince: null,
      lastSignInAt: null,
      emailConfirmed: false,
      profileState: "missing",
    });
  });
});
