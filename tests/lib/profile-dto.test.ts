import { mapAccountProfile } from "@/lib/dto/profile";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const LEGACY_PHOTO_PATH = "/Users/person/Pictures/avatar.png";

const identity = {
  id: USER_ID,
  email: " USER@Example.com ",
  user_metadata: { app_passcode_hash: "forbidden-pin-hash" },
  access_token: "forbidden-token",
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    first_name: " Avery ",
    last_name: " Stone ",
    phone: "+1 415 555 0100",
    country: "United States",
    timezone: "America/New_York",
    default_currency: "usd",
    notify_price_alerts: true,
    notify_portfolio_moves: false,
    notify_news_digest: true,
    profile_version: 4,
    updated_at: "2026-09-02T08:00:00.000Z",
    role: "owner",
    ...overrides,
  };
}

describe("account profile DTO", () => {
  it("projects a UUID-owned desktop-compatible profile without raw paths or secrets", () => {
    const dto = mapAccountProfile(identity, profile());

    expect(dto).toEqual({
      userId: USER_ID,
      email: "user@example.com",
      firstName: "Avery",
      lastName: "Stone",
      phone: "+1 415 555 0100",
      country: "United States",
      timezone: "America/New_York",
      defaultCurrency: "USD",
      notifyPriceAlerts: true,
      notifyPortfolioMoves: false,
      notifyNewsDigest: true,
      profileVersion: 4,
      updatedAt: "2026-09-02T08:00:00.000Z",
    });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("forbidden-pin-hash");
    expect(serialized).not.toContain("forbidden-token");
    expect(serialized).not.toContain("owner");
  });

  it("fails closed for a mismatched profile owner or malformed Auth UUID", () => {
    expect(
      mapAccountProfile(identity, profile({ user_id: "22222222-2222-4222-8222-222222222222" })),
    ).toBeNull();
    expect(mapAccountProfile({ ...identity, id: "email-shaped-identity" }, profile())).toBeNull();
  });

  it("never projects the legacy desktop-owned photo column even when a row carries it", () => {
    const dto = mapAccountProfile(identity, profile({ profile_photo_path: LEGACY_PHOTO_PATH }));

    expect(dto).not.toBeNull();
    expect(dto).not.toHaveProperty("profilePhotoUrl");
    expect(dto).not.toHaveProperty("profilePhotoPath");
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("profile_photo_path");
    expect(serialized).not.toContain(LEGACY_PHOTO_PATH);
    expect(serialized).not.toContain("photo");
  });
});
