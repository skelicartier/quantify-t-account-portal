const mocks = vi.hoisted(() => ({
  postAccountApiJson: vi.fn(),
}));

vi.mock("@/lib/admin/account-api", () => {
  class AccountApiUnavailableError extends Error {}
  class AccountApiRequestError extends Error {}
  return {
    AccountApiRequestError,
    AccountApiUnavailableError,
    postAccountApiJson: mocks.postAccountApiJson,
  };
});

import {
  endCurrentAccountApiSession,
  heartbeatAccountApiSession,
  heartbeatCurrentAccountApiSession,
  registerCurrentAccountApiSession,
} from "@/lib/account/session-lifecycle";

function supabaseWithToken(accessToken: string | null) {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: accessToken ? { access_token: accessToken } : null },
        error: null,
      })),
    },
  };
}

describe("Account API session lifecycle hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the completed portal session with a server-generated idempotency key", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const supabase = supabaseWithToken(" bearer-token ");

    await expect(registerCurrentAccountApiSession(supabase)).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/register",
      "bearer-token",
      { source: "portal", device_name: "Web portal" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("ends the current portal session before provider sign-out when a token exists", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const supabase = supabaseWithToken("bearer-token");

    await expect(endCurrentAccountApiSession(supabase)).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/end",
      "bearer-token",
      { reason: "signed-out" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("heartbeats the current portal session with no client-controlled session id", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const supabase = supabaseWithToken(" bearer-token ");

    await expect(heartbeatCurrentAccountApiSession(supabase)).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/heartbeat",
      "bearer-token",
      { device_name: "Web portal" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("can heartbeat from an access token already read by an admin route", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });

    await expect(heartbeatAccountApiSession(" bearer-token ")).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/heartbeat",
      "bearer-token",
      { device_name: "Web portal" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("is a no-op without a usable provider session", async () => {
    await expect(registerCurrentAccountApiSession(supabaseWithToken(null))).resolves.toBe(false);

    expect(mocks.postAccountApiJson).not.toHaveBeenCalled();
  });

  it("does not fail the login/logout path when the Account API is unavailable", async () => {
    mocks.postAccountApiJson.mockRejectedValue(new Error("network detail"));

    await expect(registerCurrentAccountApiSession(supabaseWithToken("bearer-token"))).resolves.toBe(
      false,
    );
  });
});
