const cookieEvents: string[] = [];
const cookieStore = {
  value: undefined as string | undefined,
  get: vi.fn(() =>
    cookieStore.value ? { name: "qt-recovery-authorization", value: cookieStore.value } : undefined,
  ),
  set: vi.fn((name: string, value: string) => {
    cookieEvents.push(`set:${name}`);
    cookieStore.value = value;
  }),
  delete: vi.fn(() => {
    cookieEvents.push("delete");
    cookieStore.value = undefined;
  }),
};

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

import {
  RECOVERY_AUTHORIZATION_COOKIE,
  clearRecoveryAuthorization,
  consumeRecoveryAuthorization,
  createRecoveryAuthorizationValue,
  issueRecoveryAuthorization,
  verifyRecoveryAuthorizationValue,
} from "@/lib/auth/recovery-authorization";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "header.payload.signature-for-recovery-session";
const NOW = new Date("2026-09-02T07:00:00.000Z");

function marker(): string {
  return createRecoveryAuthorizationValue({
    userId: USER_ID,
    accessToken: ACCESS_TOKEN,
    now: NOW,
    nonce: "fixed-test-nonce",
  });
}

describe("recovery authorization marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieEvents.length = 0;
    cookieStore.value = undefined;
  });

  it("binds a short-lived marker to the exact user and access token", () => {
    const value = marker();

    expect(
      verifyRecoveryAuthorizationValue(value, {
        userId: USER_ID,
        accessToken: ACCESS_TOKEN,
        now: new Date(NOW.getTime() + 60_000),
      }),
    ).toBe(true);
    expect(
      verifyRecoveryAuthorizationValue(value, {
        userId: OTHER_USER_ID,
        accessToken: ACCESS_TOKEN,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      verifyRecoveryAuthorizationValue(value, {
        userId: USER_ID,
        accessToken: "different-session-token",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects expired, malformed, oversized, and tampered markers", () => {
    const value = marker();
    const tampered = `${value.slice(0, -1)}${value.endsWith("A") ? "B" : "A"}`;

    expect(
      verifyRecoveryAuthorizationValue(value, {
        userId: USER_ID,
        accessToken: ACCESS_TOKEN,
        now: new Date(NOW.getTime() + 301_000),
      }),
    ).toBe(false);
    expect(
      verifyRecoveryAuthorizationValue("not-a-marker", {
        userId: USER_ID,
        accessToken: ACCESS_TOKEN,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      verifyRecoveryAuthorizationValue("x".repeat(2_049), {
        userId: USER_ID,
        accessToken: ACCESS_TOKEN,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      verifyRecoveryAuthorizationValue(tampered, {
        userId: USER_ID,
        accessToken: ACCESS_TOKEN,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("issues an HttpOnly strict cookie and consumes it before returning authorization", async () => {
    await issueRecoveryAuthorization({
      userId: USER_ID,
      accessToken: ACCESS_TOKEN,
      secure: true,
      now: NOW,
    });

    expect(cookieStore.set).toHaveBeenCalledWith(
      RECOVERY_AUTHORIZATION_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/reset-password",
        maxAge: 300,
      }),
    );

    const authorized = await consumeRecoveryAuthorization({
      userId: USER_ID,
      accessToken: ACCESS_TOKEN,
      now: new Date(NOW.getTime() + 1_000),
    });

    expect(authorized).toBe(true);
    expect(cookieEvents).toEqual([`set:${RECOVERY_AUTHORIZATION_COOKIE}`, "delete"]);
    expect(cookieStore.value).toBeUndefined();
  });

  it("consumes invalid markers and supports explicit stale-marker cleanup", async () => {
    cookieStore.value = marker();
    await expect(
      consumeRecoveryAuthorization({
        userId: OTHER_USER_ID,
        accessToken: ACCESS_TOKEN,
        now: NOW,
      }),
    ).resolves.toBe(false);
    expect(cookieStore.delete).toHaveBeenCalledWith({
      name: RECOVERY_AUTHORIZATION_COOKIE,
      path: "/reset-password",
    });

    cookieStore.value = marker();
    await clearRecoveryAuthorization();
    expect(cookieStore.value).toBeUndefined();
  });
});
